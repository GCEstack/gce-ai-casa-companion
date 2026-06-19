#include <string.h>
#include <stdlib.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "driver/gpio.h"

#include "common.h"
#include "wake_word.h"

static const char *TAG = "wake_word";

typedef enum {
    WW_STATE_IDLE,
    WW_STATE_LISTENING,
    WW_STATE_TRIGGERED,
} ww_state_t;

static bool detect_wake_word(ww_state_t *state)
{
    /*
     * Hardware/project-specific wake-word detector.
     *
     * This skeleton supports two trigger sources:
     *   1. A physical GPIO button connected to CONFIG_CASA_WAKE_GPIO.
     *   2. A simulated/random trigger for firmware bring-up testing.
     *
     * A production build replaces this with an on-device wake-word model
     * (e.g. Espressif WakeNet) that processes I2S microphone samples.
     */
    if (*state == WW_STATE_IDLE) {
        if (gpio_get_level(CONFIG_CASA_WAKE_GPIO) == 0) {
            *state = WW_STATE_TRIGGERED;
            return true;
        }
        /* Simulate occasional wake-word for testing (roughly every 60 s). */
        if ((rand() % 600) == 0) {
            *state = WW_STATE_TRIGGERED;
            return true;
        }
    }
    return false;
}

static void wake_word_task(void *pvParameters)
{
    (void)pvParameters;
    ww_state_t state = WW_STATE_IDLE;

    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << CONFIG_CASA_WAKE_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    srand((unsigned)xTaskGetTickCount());

    while (1) {
        switch (state) {
        case WW_STATE_IDLE:
            if (detect_wake_word(&state)) {
                ESP_LOGI(TAG, "Wake-word detected");
                xEventGroupSetBits(g_system_event_group, WW_DETECTED_BIT);
                state = WW_STATE_LISTENING;
            }
            break;

        case WW_STATE_LISTENING:
            /*
             * Hold the trigger for a fixed turn window, then return to idle.
             * A real detector would stay here while voice activity is present.
             */
            vTaskDelay(pdMS_TO_TICKS(CONFIG_CASA_WAKE_HOLD_MS));
            xEventGroupClearBits(g_system_event_group, WW_DETECTED_BIT);
            ESP_LOGI(TAG, "Wake-word window closed");
            state = WW_STATE_IDLE;
            break;

        case WW_STATE_TRIGGERED:
            /* Transitional state handled above; should not linger. */
            state = WW_STATE_IDLE;
            break;
        }

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

void wake_word_task_start(void)
{
    xTaskCreate(wake_word_task, "wake_word_task", 4096, NULL, 5, NULL);
}
