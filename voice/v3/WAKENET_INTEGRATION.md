# Casa Companion WakeNet Integration Guide

This document describes how to replace the fake wake-word stub (GPIO button) with Espressif's **WakeNet** on-device wake-word engine on the ESP32-S3.

---

## Why WakeNet?

- **On-device:** No audio leaves the chip until the wake word is detected.
- **Privacy:** The microphone is only streamed to the server after the child says the trigger phrase.
- **Power:** The ESP32-S3 can run WakeNet in a low-power mode; the WiFi/WebSocket only wake up after detection.
- **Free:** Espressif provides pre-trained models for common wake words (e.g., "Hi Lexin", "Hi ESP"). Custom models can be trained.

---

## Architecture Change

### Current (Broken) Flow

```
wake_word_task: GPIO button OR random → sets WW_DETECTED_BIT
audio_tx_task:  waits for WW_DETECTED_BIT → reads mic → sends to server
```

**Problem:** The microphone is off until the wake word is "detected." The detector has no audio to work with.

### Proper WakeNet Flow

```
+-----------------------------------------------------------+
|  I2S Microphone                                           |
|  (always on, sampling at 16 kHz)                          |
+------------+----------------------------------------------+
             |
    +--------v---------+     +---------------------+
    |  Audio Front End |     |  audio_tx_task      |
    |  (AFE)           |     |  (waits for trigger)|
    |  - Noise suppr.  |     |  - sends to server  |
    |  - AEC           |     |  - 5-second window    |
    +--------+---------+     +---------------------+
             |
    +--------v---------+
    |  WakeNet         |
    |  wake-word model |
    |  (always running)|
    +--------+---------+
             |
    +--------v---------+
    |  On detection:   |
    |  set WW_DETECTED_BIT |
    +------------------+
```

The microphone feeds **AFE → WakeNet** continuously. When WakeNet detects the phrase, it sets `WW_DETECTED_BIT`, which wakes up `audio_tx_task` to start streaming to the server.

---

## Step-by-Step Integration

### Step 1: Add the ESP-SR Component

In `firmware/main/idf_component.yml`, add the speech recognition component:

```yaml
dependencies:
  espressif/esp_websocket_client: "^1.0.0"
  espressif/esp-sr: "^1.6.0"
```

Or install via command line:

```bash
cd firmware
idf.py add-dependency "esp-sr^1.6.0"
```

In `firmware/main/CMakeLists.txt`, add `esp-sr` to `_requires`:

```cmake
set(_requires
    esp_timer
    esp_wifi
    esp_websocket_client
    nvs_flash
    driver
    bt
    mbedtls
    esp-sr          # <-- ADD THIS
)
```

### Step 2: Choose a Wake Word Model

WakeNet models are distributed as `.wn3` or `.wn4` files. Espressif provides several pre-trained models:

| Model | Language | Phrase | Use Case |
|-------|----------|--------|----------|
| `wn3_hilexin` | Chinese | "Hi Lexin" | Default Chinese |
| `wn3_hiesp` | English | "Hi ESP" | Default English |
| `wn3_hilexine` | English | "Hi Lexin" | English variant |

For Casa Companion, you likely want a **custom wake word** (e.g., the character name: "Orsetto", "Drago", "Coniglio"). Espressif provides a training pipeline via the **ESP-SR Model Converter**.

**Custom model training (high level):**
1. Record ~50–100 samples of the target phrase (various accents, distances, noise).
2. Use the ESP-SR Model Converter tool to train a `.wn3` model.
3. Place the model in `firmware/model/`.
4. Reference it in `sdkconfig` or load it at runtime from SPIFFS.

**For immediate testing**, use the pre-trained `wn3_hiesp` ("Hi ESP") and treat it as a placeholder.

### Step 3: Modify `wake_word.c` to Use WakeNet

Replace the entire `wake_word.c` with the following structure. This is the **core** of the fix.

```c
#include <string.h>
#include <stdlib.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "driver/gpio.h"
#include "driver/i2s.h"

#include "common.h"
#include "wake_word.h"

/* ESP-SR headers */
#include "esp_afe_sr_iface.h"
#include "esp_afe_sr_models.h"
#include "esp_mn_iface.h"
#include "esp_mn_models.h"
#include "model_path.h"

static const char *TAG = "wake_word";

/* AFE (Audio Front End) configuration */
static esp_afe_sr_iface_t *afe_handle = NULL;
static int16_t *afe_buffer = NULL;

/* I2S read buffer for continuous microphone sampling */
static int16_t *i2s_buffer = NULL;

/* Wake word detection state */
typedef enum {
    WW_STATE_IDLE,
    WW_STATE_LISTENING,
} ww_state_t;

static void afe_init(void)
{
    afe_config_t afe_cfg = AFE_CONFIG_DEFAULT();
    afe_cfg.aec_init = false;           /* No acoustic echo cancellation (no speaker feedback loop) */
    afe_cfg.se_init = true;             /* Speech enhancement (noise suppression) */
    afe_cfg.vad_init = false;           /* We don't need VAD here; WakeNet handles it */
    afe_cfg.wakenet_init = true;        /* Enable wake word detection */
    afe_cfg.afe_ringbuf_size = 50;    /* ~1.6 s buffer at 16 kHz, 32 ms chunks */

    afe_handle = esp_afe_sr_init(&afe_cfg);
    if (afe_handle == NULL) {
        ESP_LOGE(TAG, "AFE initialization failed");
        return;
    }

    /* Buffer size = AFE internal requirements */
    int chunk_size = afe_handle->get_feed_chunksize(afe_handle);
    int buffer_size = chunk_size * sizeof(int16_t);
    i2s_buffer = heap_caps_malloc(buffer_size, MALLOC_CAP_DMA);
    if (i2s_buffer == NULL) {
        ESP_LOGE(TAG, "Failed to allocate I2S buffer");
    }

    ESP_LOGI(TAG, "AFE initialized (chunk_size=%d)", chunk_size);
}

static void wake_word_task(void *pvParameters)
{
    (void)pvParameters;
    ww_state_t state = WW_STATE_IDLE;

    afe_init();
    if (afe_handle == NULL || i2s_buffer == NULL) {
        ESP_LOGE(TAG, "Wake word task cannot start: AFE init failed");
        vTaskDelete(NULL);
        return;
    }

    /* Configure wake button as manual override */
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << CONFIG_CASA_WAKE_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    while (1) {
        switch (state) {
        case WW_STATE_IDLE: {
            /* Continuously feed microphone samples to AFE / WakeNet */
            size_t bytes_read = 0;
            esp_err_t err = i2s_read(I2S_NUM_0, i2s_buffer,
                                      afe_handle->get_feed_chunksize(afe_handle) * sizeof(int16_t),
                                      &bytes_read, pdMS_TO_TICKS(100));
            if (err == ESP_OK && bytes_read > 0) {
                afe_handle->feed(afe_handle, i2s_buffer);
            }

            /* Check if WakeNet detected the phrase */
            afe_fetch_result_t *result = afe_handle->fetch(afe_handle);
            if (result != NULL && result->wakeup_state == WAKEUP_DETECTED) {
                ESP_LOGI(TAG, "Wake word detected! (score=%d)", result->wakeup_score);
                xEventGroupSetBits(g_system_event_group, WW_DETECTED_BIT);
                state = WW_STATE_LISTENING;
            }

            /* Manual override: button press */
            if (gpio_get_level(CONFIG_CASA_WAKE_GPIO) == 0) {
                ESP_LOGI(TAG, "Wake button pressed");
                xEventGroupSetBits(g_system_event_group, WW_DETECTED_BIT);
                state = WW_STATE_LISTENING;
            }
            break;
        }

        case WW_STATE_LISTENING: {
            /* Hold the trigger window, then return to idle listening */
            vTaskDelay(pdMS_TO_TICKS(CONFIG_CASA_WAKE_HOLD_MS));
            xEventGroupClearBits(g_system_event_group, WW_DETECTED_BIT);
            ESP_LOGI(TAG, "Wake-word window closed, returning to idle listening");
            state = WW_STATE_IDLE;
            break;
        }
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void wake_word_task_start(void)
{
    xTaskCreate(wake_word_task, "wake_word_task", 8192, NULL, 5, NULL);
}
```

### Key Changes Explained

1. **`i2s_read` in the wake word task:** The microphone is now read **inside** the wake word task, not just in `audio_tx_task`. This gives the AFE/WakeNet engine a continuous audio stream.

2. **`afe_handle->feed()`:** Pushes raw I2S samples into the Audio Front End. The AFE applies noise suppression and passes the cleaned audio to WakeNet.

3. **`afe_handle->fetch()`:** Checks if WakeNet has detected the trigger. Returns a result struct with `wakeup_state` and `wakeup_score`.

4. **`WAKEUP_DETECTED`:** When this flag is set, the task sets `WW_DETECTED_BIT`, which signals `audio_tx_task` to start streaming to the server.

5. **Button still works:** The GPIO button is checked every loop as a manual override.

### Step 4: Increase `wake_word_task` Stack Size

WakeNet and AFE are memory-hungry. Increase the stack:

```c
xTaskCreate(wake_word_task, "wake_word_task", 16384, NULL, 5, NULL);
```

(Changed from 4096 to 16384.)

### Step 5: Verify `sdkconfig` Audio Settings

In `firmware/sdkconfig.defaults` (or via `idf.py menuconfig`), ensure:

```
CONFIG_ESP32_S3_DEFAULT_CPU_FREQ_240=y
CONFIG_ESP32_S3_SPIRAM_SUPPORT=y          # Recommended for large models
CONFIG_ESP32_S3_SPIRAM_MODE_OCT=y
```

WakeNet models can be large (500 KB–2 MB). SPIRAM (PSRAM) is strongly recommended on the ESP32-S3.

### Step 6: Disable the Old `audio_tx_task` Mic Read During Idle

The current `audio_tx_task` reads from `I2S_NUM_0` directly. With WakeNet, the wake word task now owns the microphone during idle. However, `audio_tx_task` still needs to read the microphone **during** the active window.

There are two approaches:

**Option A: Shared microphone (simplest)**
- The wake word task reads I2S continuously and feeds AFE.
- During the active window, `audio_tx_task` also reads from I2S.
- This works because I2S `i2s_read` is a ring buffer — both consumers can read from it. However, the reads will be split between the two tasks, so `audio_tx_task` may miss samples.

**Option B: Dual-buffer or AFE output tap (better)**
- The AFE has a ring buffer. You can tap the output.
- Or, restructure so `audio_tx_task` reads from the AFE's output buffer instead of raw I2S.
- This requires more code but is cleaner.

**Recommended for now:** Keep the current architecture where `audio_tx_task` reads raw I2S during the active window. The wake word task reads I2S during idle. The 5-second window is short enough that sample contention is unlikely to cause significant issues. If it does, move to Option B.

### Step 7: Test and Calibrate

1. **Flash the firmware** and open the serial monitor.
2. **Speak the wake word** (e.g., "Hi ESP") at normal volume from 1–2 meters.
3. Check the logs: you should see `Wake word detected! (score=X)`.
4. **Adjust sensitivity:** If detection is too aggressive (false positives) or too weak (misses), tune via the AFE config or the model's threshold.

---

## Fallback: No WakeNet, Use Button + NFC Only

If WakeNet integration is too complex for the current timeline, the device can work with:

- **NFC medallion tap** (primary trigger) — handled by `nfc_task.c`
- **Physical button press** (fallback) — handled by `wake_word_task.c`
- **No always-on listening** — the device sleeps until triggered

This is actually a safer COPPA-compliant design for a children's product because:
- The child **must** physically interact with the device (tap or button) to start listening.
- There is no risk of accidental recording.
- Parents can see exactly when the device is active.

To implement this fallback:
1. Keep the cleaned-up `wake_word.c` (button only, no random).
2. Ensure `nfc_task.c` sets `WW_DETECTED_BIT` when a medallion is tapped.
3. Document clearly: "Casa Companion activates by tapping a medallion or pressing the button."

---

## Summary of What's Fixed vs. What Remains

| Issue | Status | Notes |
|-------|--------|-------|
| Random trigger | **FIXED** | Removed from `wake_word.c` |
| Button trigger | **Works** | Kept as fallback |
| NFC medallion trigger | **Works** | `nfc_task.c` already sets bits |
| WakeNet integration | **TODO** | Follow this guide |
| `LISTENING_BIT` dead code | **Documented** | Commented in `audio_task.c` |
| Continuous mic for AFE | **TODO** | Requires the architecture change above |
| Custom wake word model | **TODO** | Needs training data + model converter |

---

*Last updated: 2026-06-15*
