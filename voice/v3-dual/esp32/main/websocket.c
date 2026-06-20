/* websocket.c — ESP32 WebSocket client using esp_websocket_client
 *
 * Sends:
 *   - Binary PCM audio from microphone
 *   - JSON commands from button events
 *
 * Receives:
 *   - Binary PCM audio for speaker
 *   - JSON commands (interrupt, reset, volume)
 */

#include "websocket.h"
#include "esp_log.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "cJSON.h"

static const char *TAG = "WEBSOCKET";

#define MAX_AUDIO_QUEUE 16
#define MAX_CMD_QUEUE   8
#define MAX_PACKET_SIZE 4096

static QueueHandle_t audio_queue = NULL;
static QueueHandle_t cmd_queue = NULL;
static esp_websocket_client_handle_t client = NULL;
static bool connected = false;

static const char *command_to_string(ws_command_t cmd)
{
    switch (cmd) {
        case WS_CMD_INTERRUPT: return "interrupt";
        case WS_CMD_STOP: return "stop";
        case WS_CMD_LOUDER: return "louder";
        case WS_CMD_SOFTER: return "softer";
        case WS_CMD_RESET: return "reset";
        case WS_CMD_START_LISTENING: return "wake";
        case WS_CMD_STOP_LISTENING: return "stop";
        default: return "none";
    }
}

static ws_command_t string_to_command(const char *str)
{
    if (strcmp(str, "interrupt") == 0) return WS_CMD_INTERRUPT;
    if (strcmp(str, "stop") == 0) return WS_CMD_STOP;
    if (strcmp(str, "louder") == 0) return WS_CMD_LOUDER;
    if (strcmp(str, "softer") == 0) return WS_CMD_SOFTER;
    if (strcmp(str, "reset") == 0) return WS_CMD_RESET;
    if (strcmp(str, "start_listening") == 0) return WS_CMD_START_LISTENING;
    if (strcmp(str, "stop_listening") == 0) return WS_CMD_STOP_LISTENING;
    return WS_CMD_NONE;
}

static void push_audio_packet(const uint8_t *data, size_t len)
{
    if (!audio_queue || len == 0) return;

    ws_audio_packet_t *pkt = malloc(sizeof(ws_audio_packet_t));
    if (!pkt) {
        ESP_LOGE(TAG, "Failed to allocate audio packet");
        return;
    }
    pkt->data = malloc(len);
    if (!pkt->data) {
        free(pkt);
        return;
    }
    memcpy(pkt->data, data, len);
    pkt->len = len;

    if (xQueueSend(audio_queue, &pkt, 0) != pdTRUE) {
        ESP_LOGW(TAG, "Audio queue full, dropping packet");
        free(pkt->data);
        free(pkt);
    }
}

static void push_command(const char *cmd_str)
{
    if (!cmd_queue) return;
    ws_command_t cmd = string_to_command(cmd_str);
    if (cmd == WS_CMD_NONE) return;
    xQueueSend(cmd_queue, &cmd, 0);
}

static void websocket_event_handler(void *handler_args, esp_event_base_t base,
                                    int32_t event_id, void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    switch (event_id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WebSocket connected");
            connected = true;
            break;

        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WebSocket disconnected");
            connected = false;
            break;

        case WEBSOCKET_EVENT_DATA:
            if (data->op_code == WS_TRANSPORT_OPCODES_BIN && data->data_len > 0) {
                ESP_LOGD(TAG, "Received binary: %d bytes", data->data_len);
                push_audio_packet((const uint8_t *)data->data_ptr, data->data_len);
            } else if (data->op_code == WS_TRANSPORT_OPCODES_TEXT && data->data_len > 0) {
                ESP_LOGD(TAG, "Received text: %.*s", data->data_len, data->data_ptr);
                cJSON *root = cJSON_ParseWithLength(data->data_ptr, data->data_len);
                if (!root) break;

                cJSON *type = cJSON_GetObjectItem(root, "type");
                if (cJSON_IsString(type)) {
                    if (strcmp(type->valuestring, "command") == 0) {
                        cJSON *cmd = cJSON_GetObjectItem(root, "command");
                        if (cJSON_IsString(cmd)) {
                            push_command(cmd->valuestring);
                        }
                    }
                    // State changes / transcripts can be logged or handled here
                }
                cJSON_Delete(root);
            }
            break;

        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGE(TAG, "WebSocket error");
            connected = false;
            break;

        default:
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
        .buffer_size = MAX_PACKET_SIZE,
        .transport = WEBSOCKET_TRANSPORT_OVER_TCP,
        .reconnect_timeout_ms = 3000,
        .network_timeout_ms = 5000,
    };

    client = esp_websocket_client_init(&ws_cfg);
    ESP_ERROR_CHECK(esp_websocket_register_events(client, WEBSOCKET_EVENT_ANY,
                                                  websocket_event_handler, NULL));
    ESP_ERROR_CHECK(esp_websocket_client_start(client));
}

void ws_poll(int timeout_ms)
{
    if (!connected) {
        // Wait a bit before reconnect logic is handled by the client internally
        vTaskDelay(pdMS_TO_TICKS(timeout_ms));
        return;
    }
    vTaskDelay(pdMS_TO_TICKS(timeout_ms));
}

bool ws_send_binary(const uint8_t *data, size_t len)
{
    if (!client || !connected || !data || len == 0) return false;

    int ret = esp_websocket_client_send_bin(client, (const char *)data, len,
                                            pdMS_TO_TICKS(100));
    if (ret < 0) {
        ESP_LOGE(TAG, "Failed to send binary: %d", ret);
        return false;
    }
    ESP_LOGD(TAG, "Sent binary: %d bytes", len);
    return true;
}

bool ws_send_command(ws_command_t cmd)
{
    if (!client || !connected) return false;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "command");
    cJSON_AddStringToObject(root, "command", command_to_string(cmd));
    char *text = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!text) return false;

    int ret = esp_websocket_client_send_text(client, text, strlen(text),
                                             pdMS_TO_TICKS(100));
    free(text);

    if (ret < 0) {
        ESP_LOGE(TAG, "Failed to send command: %d", ret);
        return false;
    }
    ESP_LOGI(TAG, "Sent command: %s", command_to_string(cmd));
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
