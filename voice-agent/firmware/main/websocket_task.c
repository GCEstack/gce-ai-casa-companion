#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_websocket_client.h"

#include "common.h"
#include "websocket_task.h"
#include "power_mgmt.h"

static const char *TAG = "websocket";

static esp_websocket_client_handle_t s_ws_client = NULL;

/* Lightweight JSON value extractor. Returns pointer to value and fills len. */
static const char *json_find_str(const char *json, const char *key, size_t *len)
{
    char needle[64];
    snprintf(needle, sizeof(needle), "\"%s\":\"", key);
    const char *start = strstr(json, needle);
    if (start == NULL) {
        return NULL;
    }
    start += strlen(needle);
    const char *end = strchr(start, '"');
    if (end == NULL) {
        return NULL;
    }
    *len = (size_t)(end - start);
    return start;
}

static bool json_find_str_copy(const char *json, const char *key, char *out, size_t out_len)
{
    size_t len = 0;
    const char *val = json_find_str(json, key, &len);
    if (val == NULL || len == 0) {
        return false;
    }
    size_t copy = (len >= out_len) ? out_len - 1 : len;
    memcpy(out, val, copy);
    out[copy] = '\0';
    return true;
}

static const char *json_find_type(const char *json, size_t *len)
{
    return json_find_str(json, "type", len);
}

static void ws_send_status(void)
{
    casa_json_msg_t msg = {0};
    char state_str[16] = {0};
    char character[32] = {0};

    casa_get_character(character, sizeof(character));
    strncpy(state_str, casa_state_to_str(g_casa_state.state), sizeof(state_str) - 1);

    snprintf(msg.json, sizeof(msg.json),
             "{\"type\":\"%s\",\"state\":\"%s\",\"battery\":%u,\"character\":\"%s\",\"mode\":\"%s\"}",
             CASA_MSG_STATUS, state_str, g_casa_state.battery_pct,
             character, g_casa_state.mode);
    xQueueSend(g_control_tx_queue, &msg, 0);
}

static void ws_send_mode_change(void)
{
    casa_json_msg_t msg = {0};
    snprintf(msg.json, sizeof(msg.json),
             "{\"type\":\"%s\",\"mode\":\"%s\",\"character\":\"%s\"}",
             CASA_MSG_MODE_CHANGE, g_casa_state.mode, g_casa_state.character);
    xQueueSend(g_control_tx_queue, &msg, 0);
}

static void handle_voice_input(const char *json)
{
    size_t b64_len = 0;
    const char *b64 = json_find_str(json, "data", &b64_len);
    if (b64 == NULL || b64_len == 0) {
        ESP_LOGW(TAG, "voice_input missing data");
        return;
    }

    casa_message_t pcm = {0};
    size_t decoded_len = 0;
    int err = casa_base64_decode(pcm.payload, sizeof(pcm.payload), &decoded_len,
                                 b64, b64_len);
    if (err != 0 || decoded_len == 0) {
        ESP_LOGE(TAG, "Failed to decode voice_input base64: %d", err);
        return;
    }
    pcm.len = (uint16_t)decoded_len;
    xQueueSend(g_pcm_rx_queue, &pcm, 0);

    casa_set_state(CASA_STATE_SPEAKING);
    xEventGroupSetBits(g_system_event_group, SPEAKING_BIT);
    ws_send_status();
}

static void handle_mode_select(const char *json)
{
    char mode[32] = {0};
    char character[32] = {0};
    bool mode_changed = json_find_str_copy(json, "mode", mode, sizeof(mode));
    bool char_changed = json_find_str_copy(json, "character", character, sizeof(character));

    if (mode_changed) {
        casa_set_mode(mode);
    }
    if (char_changed) {
        casa_set_character(character);
    }

    if (mode_changed || char_changed) {
        ws_send_mode_change();
        ws_send_status();
        ESP_LOGI(TAG, "Mode select: character=%s mode=%s",
                 g_casa_state.character, g_casa_state.mode);
    }
}

static void handle_connect(const char *json)
{
    char character[32] = {0};
    if (json_find_str_copy(json, "character", character, sizeof(character))) {
        casa_set_character(character);
    }
    casa_set_state(CASA_STATE_ONLINE);
    ws_send_status();
    ESP_LOGI(TAG, "Frontend connected, character=%s", g_casa_state.character);
}

static void handle_control_json(const char *json)
{
    if (strstr(json, "\"kill\"") || strstr(json, "\"sleep\"") ||
        strstr(json, "\"timeout\"")) {
        xEventGroupSetBits(g_system_event_group, SLEEP_REQUESTED_BIT);
        return;
    }

    size_t type_len = 0;
    const char *type = json_find_type(json, &type_len);
    if (type == NULL || type_len == 0) {
        return;
    }

    if (type_len == strlen(CASA_MSG_VOICE_INPUT) &&
        strncmp(type, CASA_MSG_VOICE_INPUT, type_len) == 0) {
        handle_voice_input(json);
    } else if (type_len == strlen(CASA_MSG_MODE_SELECT) &&
               strncmp(type, CASA_MSG_MODE_SELECT, type_len) == 0) {
        handle_mode_select(json);
    } else if (type_len == strlen(CASA_MSG_CONNECT) &&
               strncmp(type, CASA_MSG_CONNECT, type_len) == 0) {
        handle_connect(json);
    } else {
        ESP_LOGI(TAG, "Unhandled control type: %.*s", (int)type_len, type);
    }
}

static void ws_event_handler(void *handler_args, esp_event_base_t base,
                             int32_t event_id, void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;
    (void)handler_args;
    (void)base;

    switch (event_id) {
    case WEBSOCKET_EVENT_CONNECTED:
        ESP_LOGI(TAG, "WebSocket connected");
        xEventGroupSetBits(g_system_event_group, WS_CONNECTED_BIT);
        casa_set_state(CASA_STATE_ONLINE);
        ws_send_status();
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "WebSocket disconnected");
        xEventGroupClearBits(g_system_event_group, WS_CONNECTED_BIT);
        casa_set_state(CASA_STATE_OFFLINE);
        break;

    case WEBSOCKET_EVENT_DATA:
        if (data->op_code == 0x01 && data->data_len > 0) {
            /* Text: JSON command from frontend/relay */
            char json[CASA_MAX_JSON_BYTES];
            size_t copy = (data->data_len >= sizeof(json)) ? sizeof(json) - 1 : data->data_len;
            memcpy(json, data->data_ptr, copy);
            json[copy] = '\0';
            handle_control_json(json);
        } else if (data->op_code == 0x02 && data->data_len > 0) {
            /* Binary: not expected in the JSON protocol, but tolerate it as raw PCM. */
            casa_message_t msg = {0};
            msg.len = (data->data_len > sizeof(msg.payload)) ? sizeof(msg.payload) : data->data_len;
            memcpy(msg.payload, data->data_ptr, msg.len);
            xQueueSend(g_pcm_rx_queue, &msg, 0);
        }
        break;

    case WEBSOCKET_EVENT_ERROR:
        ESP_LOGE(TAG, "WebSocket error");
        break;

    default:
        break;
    }
}

static void ws_tx_task(void *pvParameters)
{
    (void)pvParameters;
    esp_websocket_client_handle_t client = s_ws_client;

    while (1) {
        xEventGroupWaitBits(g_system_event_group, WS_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);

        casa_json_msg_t msg = {0};
        if (xQueueReceive(g_voice_tx_queue, &msg, pdMS_TO_TICKS(20)) == pdTRUE) {
            if (esp_websocket_client_is_connected(client)) {
                int ret = esp_websocket_client_send_text(client, msg.json,
                                                         strlen(msg.json), pdMS_TO_TICKS(1000));
                if (ret < 0) {
                    ESP_LOGE(TAG, "Failed to send voice_stream");
                }
            }
        }

        if (xQueueReceive(g_control_tx_queue, &msg, 0) == pdTRUE) {
            if (esp_websocket_client_is_connected(client)) {
                int ret = esp_websocket_client_send_text(client, msg.json,
                                                         strlen(msg.json), pdMS_TO_TICKS(1000));
                if (ret < 0) {
                    ESP_LOGE(TAG, "Failed to send control JSON");
                }
            }
        }
    }
}

static void websocket_task(void *pvParameters)
{
    (void)pvParameters;

    xEventGroupWaitBits(g_system_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);

    const char *uri = CONFIG_CASA_WEBSOCKET_URI;

    esp_websocket_client_config_t ws_cfg = {
        .uri = uri,
        .reconnect_timeout_ms = 3000,
        .network_timeout_ms = 10000,
        .keep_alive_enable = true,
        .keep_alive_idle = 30,
        .keep_alive_interval = 5,
        .keep_alive_count = 3,
    };

    s_ws_client = esp_websocket_client_init(&ws_cfg);
    if (s_ws_client == NULL) {
        ESP_LOGE(TAG, "Failed to init WebSocket client");
        vTaskDelete(NULL);
        return;
    }

    esp_websocket_register_events(s_ws_client, WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);
    esp_websocket_client_start(s_ws_client);

    xTaskCreate(ws_tx_task, "ws_tx_task", 4096, NULL, 5, NULL);

    ESP_LOGI(TAG, "WebSocket connecting to %s", uri);

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void websocket_task_start(void)
{
    xTaskCreate(websocket_task, "websocket_task", 8192, NULL, 5, NULL);
}
