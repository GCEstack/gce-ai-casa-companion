/* Casa Voice V2 — ESP32-S3 Firmware (Wake Phrase + Button Interrupt Edition)
 *
 * Architecture:
 *   Core 0 (PRO_CPU): Wi-Fi + WebSocket task
 *   Core 1 (APP_CPU): Audio task (I2S0 TX speaker + I2S1 RX mic)
 *
 * Dual I2S:
 *   I2S0 → TX → MAX98357A (speaker) — GPIOs: BCLK=4, WS=5, DOUT=6
 *   I2S1 → RX → INMP441 (mic) — GPIOs: BCLK=7, WS=15, DIN=16
 *
 * Mic Button: GPIO 18 (pull-up, active low)
 *   - Short press: INTERRUPT (while speaking)
 *   - Long press (>1s): RESET session
 *
 * VAD: Energy gate with hysteresis (threshold=0.025)
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "driver/gpio.h"

#include "wifi.h"
#include "websocket.h"
#include "i2s_dual.h"
#include "vad.h"

#define TAG "CASA_VOICE"

/* Task priorities */
#define TASK_PRIORITY_WIFI      5
#define TASK_PRIORITY_WS        4
#define TASK_PRIORITY_AUDIO     6
#define TASK_PRIORITY_BUTTON    7

/* Stack sizes */
#define STACK_SIZE_WIFI         4096
#define STACK_SIZE_WS           8192
#define STACK_SIZE_AUDIO        8192
#define STACK_SIZE_BUTTON       2048

/* Core affinity */
#define CORE_WIFI               0
#define CORE_WS                 0
#define CORE_AUDIO              1
#define CORE_BUTTON             0

/* Audio config */
#define SAMPLE_RATE             16000
#define BUFFER_SAMPLES          512

/* Mic Button */
#define MIC_BUTTON_GPIO         18
#define BUTTON_LONG_PRESS_MS    1000

/* Message types for button → audio task communication */
typedef enum {
    BTN_EVT_SHORT_PRESS = 1,   /* Interrupt */
    BTN_EVT_LONG_PRESS = 2,    /* Reset */
} button_event_t;

static QueueHandle_t button_queue = NULL;

static void websocket_task(void *pvParameters);
static void audio_task(void *pvParameters);
static void button_task(void *pvParameters);
static void IRAM_ATTR button_isr_handler(void *arg);

void app_main(void)
{
    ESP_LOGI(TAG, "Casa Voice V2 ESP32-S3 starting...");

    /* Initialize NVS */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* Initialize Wi-Fi */
    wifi_init_sta();

    /* Initialize button GPIO */
    gpio_config_t btn_cfg = {
        .pin_bit_mask = (1ULL << MIC_BUTTON_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_NEGEDGE,  /* Falling edge = button press */
    };
    ESP_ERROR_CHECK(gpio_config(&btn_cfg));
    ESP_ERROR_CHECK(gpio_install_isr_service(0));
    ESP_ERROR_CHECK(gpio_isr_handler_add(MIC_BUTTON_GPIO, button_isr_handler, NULL));

    button_queue = xQueueCreate(4, sizeof(button_event_t));

    /* Wait for Wi-Fi */
    ESP_LOGI(TAG, "Waiting for Wi-Fi...");
    wifi_wait_connected();
    ESP_LOGI(TAG, "Wi-Fi connected");

    /* Initialize dual I2S */
    i2s_dual_init(SAMPLE_RATE);
    ESP_LOGI(TAG, "Dual I2S initialized (I2S0 TX + I2S1 RX)");

    /* Initialize VAD */
    vad_init(0.025f, 3, 10);
    ESP_LOGI(TAG, "VAD initialized (threshold=0.025, hysteresis)");

    /* Create tasks */
    xTaskCreatePinnedToCore(websocket_task, "websocket_task", STACK_SIZE_WS, NULL, TASK_PRIORITY_WS, NULL, CORE_WS);
    xTaskCreatePinnedToCore(audio_task, "audio_task", STACK_SIZE_AUDIO, NULL, TASK_PRIORITY_AUDIO, NULL, CORE_AUDIO);
    xTaskCreatePinnedToCore(button_task, "button_task", STACK_SIZE_BUTTON, NULL, TASK_PRIORITY_BUTTON, NULL, CORE_BUTTON);

    ESP_LOGI(TAG, "All tasks created. System running.");
}

/* ── Button ISR ── */
static void IRAM_ATTR button_isr_handler(void *arg)
{
    /* Just wake the button task — debounce in task context */
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    /* No queue send in ISR — use task notification or simple flag */
    /* For simplicity, we just let the button task poll */
    (void)arg;
}

/* ── Button Task (Core 0) ── */
static void button_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Button task on Core %d", xPortGetCoreID());

    uint32_t press_start = 0;
    bool pressed = false;

    while (1) {
        int level = gpio_get_level(MIC_BUTTON_GPIO);

        if (level == 0 && !pressed) {
            /* Button pressed */
            pressed = true;
            press_start = xTaskGetTickCount();
        } else if (level == 1 && pressed) {
            /* Button released */
            uint32_t duration = (xTaskGetTickCount() - press_start) * portTICK_PERIOD_MS;
            pressed = false;

            if (duration >= BUTTON_LONG_PRESS_MS) {
                ESP_LOGI(TAG, "Button: LONG press detected → RESET");
                button_event_t evt = BTN_EVT_LONG_PRESS;
                xQueueSend(button_queue, &evt, 0);
            } else if (duration > 50) {  /* Debounce: ignore <50ms */
                ESP_LOGI(TAG, "Button: SHORT press detected → INTERRUPT");
                button_event_t evt = BTN_EVT_SHORT_PRESS;
                xQueueSend(button_queue, &evt, 0);
            }
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

/* ── WebSocket Task (Core 0) ── */
static void websocket_task(void *pvParameters)
{
    ESP_LOGI(TAG, "WebSocket task on Core %d", xPortGetCoreID());

    ws_connect("ws://your-server-ip:8080/ws/voice");

    while (1) {
        ws_poll(100);
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

/* ── Audio Task (Core 1) ── */
static void audio_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Audio task on Core %d", xPortGetCoreID());

    int16_t rx_buffer[BUFFER_SAMPLES];
    int16_t tx_buffer[BUFFER_SAMPLES];
    size_t bytes_read = 0;
    size_t bytes_written = 0;

    bool is_speaking = false;
    bool vad_triggered = false;
    bool is_listening = false;  /* True after wake phrase, false in IDLE */

    while (1) {
        /* ── Check button events ── */
        button_event_t btn_evt;
        if (xQueueReceive(button_queue, &btn_evt, 0) == pdTRUE) {
            if (btn_evt == BTN_EVT_SHORT_PRESS) {
                ESP_LOGI(TAG, "Button: sending INTERRUPT command");
                ws_send_command(WS_CMD_INTERRUPT);
                if (is_speaking) {
                    i2s_tx_stop();
                    is_speaking = false;
                }
            } else if (btn_evt == BTN_EVT_LONG_PRESS) {
                ESP_LOGI(TAG, "Button: sending RESET command");
                ws_send_command(WS_CMD_RESET);
                is_listening = false;
                is_speaking = false;
            }
        }

        /* ── RX: Read microphone (I2S1) ── */
        i2s_rx_read(rx_buffer, sizeof(rx_buffer), &bytes_read, pdMS_TO_TICKS(50));

        if (bytes_read > 0) {
            /* Run VAD */
            vad_result_t vad = vad_process(rx_buffer, bytes_read / sizeof(int16_t));

            if (vad == VAD_SPEECH) {
                /* In IDLE: always send (server filters for wake phrase) */
                /* In LISTENING: send speech */
                if (!is_speaking) {
                    ws_send_binary((uint8_t *)rx_buffer, bytes_read);
                }
                vad_triggered = true;
            } else if (vad == VAD_SILENCE && vad_triggered) {
                /* Send silence marker so server knows utterance ended */
                ws_send_binary((uint8_t *)rx_buffer, 0);  /* 0-byte = silence marker */
                vad_triggered = false;
            }
        }

        /* ── TX: Check for incoming TTS from WebSocket ── */
        ws_audio_packet_t *pkt = ws_get_audio_packet(0);
        if (pkt) {
            is_speaking = true;
            size_t to_write = pkt->len;
            size_t offset = 0;
            while (to_write > 0) {
                size_t chunk = (to_write > sizeof(tx_buffer)) ? sizeof(tx_buffer) : to_write;
                memcpy(tx_buffer, pkt->data + offset, chunk);
                i2s_tx_write(tx_buffer, chunk, &bytes_written, portMAX_DELAY);
                offset += chunk;
                to_write -= chunk;
            }
            ws_free_audio_packet(pkt);
            is_speaking = false;
        }

        /* ── Handle server commands ── */
        ws_command_t cmd = ws_get_command(0);
        if (cmd == WS_CMD_INTERRUPT) {
            ESP_LOGI(TAG, "Server: INTERRUPT received, stopping playback");
            i2s_tx_stop();
            is_speaking = false;
        } else if (cmd == WS_CMD_RESET) {
            ESP_LOGI(TAG, "Server: RESET received, clearing state");
            is_listening = false;
            is_speaking = false;
            i2s_tx_stop();
        } else if (cmd == WS_CMD_START_LISTENING) {
            ESP_LOGI(TAG, "Server: START_LISTENING received");
            is_listening = true;
        } else if (cmd == WS_CMD_STOP_LISTENING) {
            ESP_LOGI(TAG, "Server: STOP_LISTENING received");
            is_listening = false;
        }

        vTaskDelay(pdMS_TO_TICKS(5));
    }
}
