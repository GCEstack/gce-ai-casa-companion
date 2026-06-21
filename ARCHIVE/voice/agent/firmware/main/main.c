#include <string.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_netif.h"

#include "common.h"
#include "wifi_task.h"
#include "websocket_task.h"
#include "audio_task.h"
#include "wake_word.h"
#include "ble_task.h"
#include "nfc_task.h"
#include "power_mgmt.h"

static const char *TAG = "main";

QueueHandle_t g_voice_tx_queue = NULL;
QueueHandle_t g_pcm_rx_queue = NULL;
QueueHandle_t g_control_tx_queue = NULL;
QueueHandle_t g_control_rx_queue = NULL;
QueueHandle_t g_ble_queue = NULL;
QueueHandle_t g_power_cmd_queue = NULL;
EventGroupHandle_t g_system_event_group = NULL;
SemaphoreHandle_t g_state_mutex = NULL;
casa_global_state_t g_casa_state = {0};

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    g_system_event_group = xEventGroupCreate();
    if (g_system_event_group == NULL) {
        ESP_LOGE(TAG, "Failed to create system event group");
        return;
    }

    g_state_mutex = xSemaphoreCreateMutex();
    if (g_state_mutex == NULL) {
        ESP_LOGE(TAG, "Failed to create state mutex");
        return;
    }

    /* Initialize global state */
    casa_set_state(CASA_STATE_OFFLINE);
    casa_set_character(CONFIG_CASA_DEFAULT_CHARACTER);
    casa_set_mode(CONFIG_CASA_DEFAULT_MODE);
    g_casa_state.battery_pct = 100;

    /* Fixed-size queues keep all producer/consumer tasks non-blocking. */
    g_voice_tx_queue   = xQueueCreate(24, sizeof(casa_json_msg_t));
    g_pcm_rx_queue     = xQueueCreate(16, sizeof(casa_message_t));
    g_control_tx_queue = xQueueCreate(8, sizeof(casa_json_msg_t));
    g_control_rx_queue = xQueueCreate(8, sizeof(casa_json_msg_t));
    g_ble_queue        = xQueueCreate(8, sizeof(casa_json_msg_t));
    g_power_cmd_queue  = xQueueCreate(4, sizeof(casa_power_cmd_t));

    if (!g_voice_tx_queue || !g_pcm_rx_queue || !g_control_tx_queue ||
        !g_control_rx_queue || !g_ble_queue || !g_power_cmd_queue) {
        ESP_LOGE(TAG, "Failed to allocate queues");
        return;
    }

    /* Start subsystem tasks. */
    wifi_task_start();
    websocket_task_start();
    audio_task_start();
    wake_word_task_start();
    ble_task_start();
    nfc_task_start();
    power_mgmt_start();

    ESP_LOGI(TAG, "Casa Companion firmware started (character=%s, mode=%s)",
             g_casa_state.character, g_casa_state.mode);

    /* Supervisory loop: monitor the sleep-request bit. */
    while (1) {
        EventBits_t bits = xEventGroupWaitBits(
            g_system_event_group,
            SLEEP_REQUESTED_BIT,
            pdTRUE,
            pdFALSE,
            pdMS_TO_TICKS(1000));

        if (bits & SLEEP_REQUESTED_BIT) {
            power_mgmt_enter_deep_sleep();
        }
    }
}
