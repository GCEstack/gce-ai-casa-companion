#include <string.h>
#include <stdio.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "driver/adc.h"
#include "driver/gpio.h"

#include "common.h"
#include "power_mgmt.h"

static const char *TAG = "power";

static uint32_t read_battery_mv(void)
{
    int raw = adc1_get_raw((adc1_channel_t)CONFIG_CASA_BATTERY_ADC_CHANNEL);
    if (raw < 0) {
        raw = 0;
    }
    uint32_t mv = (uint32_t)raw * CONFIG_CASA_BATTERY_ADC_VREF_MV / 4095;
    mv = (mv * (CONFIG_CASA_BATTERY_DIVIDER_R1 + CONFIG_CASA_BATTERY_DIVIDER_R2))
         / CONFIG_CASA_BATTERY_DIVIDER_R2;
    return mv;
}

static uint8_t battery_pct(uint32_t mv)
{
    if (mv >= 4200) return 100;
    if (mv >= 4000) return 80;
    if (mv >= 3800) return 50;
    if (mv >= 3600) return 20;
    if (mv >= 3300) return 10;
    return 5;
}

static void power_send_battery_status(uint32_t mv, uint8_t pct)
{
    char state_str[16] = {0};
    strncpy(state_str, casa_state_to_str(g_casa_state.state), sizeof(state_str) - 1);

    casa_json_msg_t msg = {0};
    snprintf(msg.json, sizeof(msg.json),
             "{\"type\":\"%s\",\"state\":\"%s\",\"battery\":%u,\"mv\":%lu}",
             CASA_MSG_STATUS, state_str, pct, (unsigned long)mv);
    xQueueSend(g_control_tx_queue, &msg, 0);
}

static void power_task(void *pvParameters)
{
    (void)pvParameters;

    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten((adc1_channel_t)CONFIG_CASA_BATTERY_ADC_CHANNEL, ADC_ATTEN_DB_12);

    TickType_t last_report = xTaskGetTickCount();

    while (1) {
        uint32_t mv = read_battery_mv();
        uint8_t pct = battery_pct(mv);
        casa_set_battery_pct(pct);

        if ((xTaskGetTickCount() - last_report) > pdMS_TO_TICKS(CONFIG_CASA_BATTERY_REPORT_MS)) {
            power_send_battery_status(mv, pct);
            last_report = xTaskGetTickCount();
        }

        if (pct < CONFIG_CASA_BATTERY_SLEEP_THRESHOLD) {
            ESP_LOGW(TAG, "Battery low (%u%%), entering deep sleep", pct);
            xEventGroupSetBits(g_system_event_group, SLEEP_REQUESTED_BIT);
        }

        casa_power_cmd_t cmd = POWER_CMD_NONE;
        if (xQueueReceive(g_power_cmd_queue, &cmd, pdMS_TO_TICKS(1000)) == pdTRUE) {
            if (cmd == POWER_CMD_SLEEP || cmd == POWER_CMD_KILL || cmd == POWER_CMD_TIMEOUT) {
                ESP_LOGI(TAG, "Power command received: %d", cmd);
                xEventGroupSetBits(g_system_event_group, SLEEP_REQUESTED_BIT);
            }
        }
    }
}

void power_mgmt_start(void)
{
    xTaskCreate(power_task, "power_task", 4096, NULL, 5, NULL);
}

void power_mgmt_enter_deep_sleep(void)
{
    ESP_LOGI(TAG, "Entering deep sleep");

    casa_json_msg_t msg = {0};
    snprintf(msg.json, sizeof(msg.json),
             "{\"type\":\"%s\",\"state\":\"offline\"}", CASA_MSG_STATUS);
    xQueueSend(g_control_tx_queue, &msg, 0);
    vTaskDelay(pdMS_TO_TICKS(100));

    gpio_pullup_en((gpio_num_t)CONFIG_CASA_WAKE_GPIO);
    esp_sleep_enable_ext0_wakeup((gpio_num_t)CONFIG_CASA_WAKE_GPIO, 0);
    esp_sleep_enable_timer_wakeup((uint64_t)CONFIG_CASA_SLEEP_DURATION_MS * 1000ULL);

    esp_deep_sleep_start();
}
