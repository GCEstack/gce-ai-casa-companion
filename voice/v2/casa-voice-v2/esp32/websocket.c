/* websocket.c — ESP32 WebSocket Client (esp_websocket_client)
 *
 * Uses ESP-IDF's esp_websocket_client component for robust WebSocket
 * communication with automatic reconnect and event handling.
 *
 * Required: ESP-IDF v5.x with esp_websocket_client component enabled
 * Menuconfig: Component config → ESP WebSocket Client → Enable
 */

#include "websocket.h"
#include "esp_log.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "cJSON.h"
#include <string.h>

static const char *TAG = "WEBSOCKET";

#define MAX_AUDIO_QUEUE 10
#define MAX_CMD_QUEUE   5
#define MAX_PACKET_SIZE 4096

static QueueHandle_t audio_queue = NULL;
static QueueHandle_t cmd_queue = NULL;
static esp_websocket_client_handle_t ws_client = NULL;
static bool ws_connected = false;

static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    switch (event_id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WebSocket connected");
            ws_connected = true;
            break;

        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WebSocket disconnected");
            ws_connected = false;
            break;

        case WEBSOCKET_EVENT_DATA:
            if (data->op_code == WS_TRANSPORT_OPCODES_BINARY) {
                /* Audio packet from server → queue for playback */
                ws_audio_packet_t *pkt = malloc(sizeof(ws_audio_packet_t));
                if (pkt) {
                    pkt->data = malloc(data->data_len);
                    if (pkt->data) {
                        memcpy(pkt->data, data->data_ptr, data->data_len);
                        pkt->len = data->data_len;
                        if (xQueueSend(audio_queue, &pkt, 0) != pdTRUE) {
                            free(pkt->data);
                            free(pkt);
                            ESP_LOGW(TAG, "Audio queue full, dropped packet");
                        }
                    } else {
                        free(pkt);
                    }
                }
            } else if (data->op_code == WS_TRANSPORT_OPCODES_TEXT) {
                /* JSON command from server */
                char *text = strndup(data->data_ptr, data->data_len);
                if (text) {
                    cJSON *json = cJSON_Parse(text);
                    if (json) {
                        cJSON *type = cJSON_GetObjectItem(json, "type");
                        if (type && cJSON_IsString(type)) {
                            const char *type_str = type->valuestring;
                            if (strcmp(type_str, "command") == 0) {
                                cJSON *cmd = cJSON_GetObjectItem(json, "command");
                                if (cmd && cJSON_IsString(cmd)) {
                                    const char *cmd_str = cmd->valuestring;
                                    ws_command_t ws_cmd = WS_CMD_NONE;
                                    if (strcmp(cmd_str, "interrupt") == 0) ws_cmd = WS_CMD_INTERRUPT;
                                    else if (strcmp(cmd_str, "stop") == 0) ws_cmd = WS_CMD_STOP;
                                    else if (strcmp(cmd_str, "louder") == 0) ws_cmd = WS_CMD_LOUDER;
                                    else if (strcmp(cmd_str, "softer") == 0) ws_cmd = WS_CMD_SOFTER;
                                    else if (strcmp(cmd_str, "reset") == 0) ws_cmd = WS_CMD_RESET;
                                    else if (strcmp(cmd_str, "start_listening") == 0) ws_cmd = WS_CMD_START_LISTENING;
                                    else if (strcmp(cmd_str, "stop_listening") == 0) ws_cmd = WS_CMD_STOP_LISTENING;
                                    xQueueSend(cmd_queue, &ws_cmd, 0);
                                }
                            } else if (strcmp(type_str, "state_change") == 0) {
                                cJSON *state = cJSON_GetObjectItem(json, "state");
                                if (state && cJSON_IsString(state)) {
                                    ESP_LOGI(TAG, "Server state: %s", state->valuestring);
                                }
                            }
                        }
                        cJSON_Delete(json);
                    }
                    free(text);
                }
            }
            break;

        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGE(TAG, "WebSocket error");
            ws_connected = false;
            break;
    }
}

void ws_connect(const char *uri)
{
    ESP_LOGI(TAG, "WebSocket connecting to: %s", uri);

    audio_queue = xQueueCreate(MAX_AUDIO_QUEUE, sizeof(ws_audio_packet_t *));
    cmd_queue = xQueueCreate(MAX_CMD_QUEUE, sizeof(ws_command_t));

    esp_websocket_client_config_t ws_cfg = {
        .uri = uri,
        .keep_alive_enable = true,
        .keep_alive_interval = 30,
        .keep_alive_idle = 60,
        .reconnect_timeout_ms = 3000,
        .network_timeout_ms = 10000,
    };

    ws_client = esp_websocket_client_init(&ws_cfg);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, NULL);
    esp_websocket_client_start(ws_client);
}

void ws_poll(int timeout_ms)
{
    /* In event-driven mode, polling is mainly for keep-alive checks */
    if (!ws_connected) {
        ESP_LOGD(TAG, "Waiting for connection...");
    }
    vTaskDelay(pdMS_TO_TICKS(timeout_ms));
}

bool ws_send_binary(const uint8_t *data, size_t len)
{
    if (!ws_connected || !ws_client) {
        ESP_LOGW(TAG, "Not connected, cannot send binary");
        return false;
    }
    int ret = esp_websocket_client_send_bin(ws_client, (const char *)data, len, portMAX_DELAY);
    if (ret < 0) {
        ESP_LOGE(TAG, "Failed to send binary: %d", ret);
        return false;
    }
    ESP_LOGD(TAG, "Sent %d bytes of audio", len);
    return true;
}

bool ws_send_command(ws_command_t cmd)
{
    if (!ws_connected || !ws_client) {
        ESP_LOGW(TAG, "Not connected, cannot send command");
        return false;
    }

    const char *cmd_str = "none";
    switch (cmd) {
        case WS_CMD_INTERRUPT: cmd_str = "interrupt"; break;
        case WS_CMD_STOP: cmd_str = "stop"; break;
        case WS_CMD_RESET: cmd_str = "reset"; break;
        case WS_CMD_LOUDER: cmd_str = "louder"; break;
        case WS_CMD_SOFTER: cmd_str = "softer"; break;
        default: break;
    }

    char json[128];
    snprintf(json, sizeof(json), "{\"type\":\"command\",\"command\":\"%s\"}", cmd_str);

    int ret = esp_websocket_client_send_text(ws_client, json, strlen(json), portMAX_DELAY);
    if (ret < 0) {
        ESP_LOGE(TAG, "Failed to send command: %d", ret);
        return false;
    }
    ESP_LOGI(TAG, "Sent command: %s", cmd_str);
    return true;
}

ws_audio_packet_t *ws_get_audio_packet(int timeout_ms)
{
    ws_audio_packet_t *pkt = NULL;
    if (audio_queue && xQueueReceive(audio_queue, &pkt, pdMS_TO_TICKS(timeout_ms)) == pdTRUE) {
        return pkt;
    }
    return NULL;
}

void ws_free_audio_packet(ws_audio_packet_t *pkt)
{
    if (pkt) {
        if (pkt->data) free(pkt->data);
        free(pkt);
    }
}

ws_command_t ws_get_command(int timeout_ms)
{
    ws_command_t cmd = WS_CMD_NONE;
    if (cmd_queue && xQueueReceive(cmd_queue, &cmd, pdMS_TO_TICKS(timeout_ms)) == pdTRUE) {
        return cmd;
    }
    return WS_CMD_NONE;
}
