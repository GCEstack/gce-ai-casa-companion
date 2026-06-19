/* websocket.h — ESP32 WebSocket Client (Wake Phrase + Button Edition) */

#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

typedef struct {
    uint8_t *data;
    size_t len;
} ws_audio_packet_t;

typedef enum {
    WS_CMD_NONE = 0,
    WS_CMD_INTERRUPT = 1,
    WS_CMD_STOP = 2,
    WS_CMD_LOUDER = 3,
    WS_CMD_SOFTER = 4,
    WS_CMD_RESET = 5,           /* Clear session */
    WS_CMD_START_LISTENING = 6, /* Server → ESP32: wake phrase detected */
    WS_CMD_STOP_LISTENING = 7,  /* Server → ESP32: return to idle */
} ws_command_t;

void ws_connect(const char *uri);
void ws_poll(int timeout_ms);
bool ws_send_binary(const uint8_t *data, size_t len);
bool ws_send_command(ws_command_t cmd);
ws_audio_packet_t *ws_get_audio_packet(int timeout_ms);
void ws_free_audio_packet(ws_audio_packet_t *pkt);
ws_command_t ws_get_command(int timeout_ms);

#endif /* WEBSOCKET_H */
