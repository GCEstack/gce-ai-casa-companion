#ifndef CASA_COMMON_H
#define CASA_COMMON_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Event-group bits used across tasks */
#define WIFI_CONNECTED_BIT      (1 << 0)
#define WS_CONNECTED_BIT        (1 << 1)
#define WW_DETECTED_BIT         (1 << 2)
#define SLEEP_REQUESTED_BIT     (1 << 3)
#define LISTENING_BIT           (1 << 4)
#define SPEAKING_BIT            (1 << 5)

/* Audio parameters (16 kHz, 16-bit, mono) */
#define CASA_SAMPLE_RATE        16000
#define CASA_VOICE_CHUNK_MS     32
#define CASA_SAMPLES_PER_FRAME  CONFIG_CASA_VOICE_CHUNK_SAMPLES   /* e.g. 512 */
#define CASA_BYTES_PER_FRAME    (CASA_SAMPLES_PER_FRAME * sizeof(int16_t)) /* 1024 */

/* Maximum sizes for queue messages */
#define CASA_MAX_PCM_BYTES      1024
#define CASA_MAX_B64_BYTES      (((CASA_MAX_PCM_BYTES + 2) / 3) * 4 + 1)  /* 1369 */
#define CASA_MAX_JSON_BYTES     2048

/* Message type strings for the JSON protocol */
#define CASA_MSG_VOICE_STREAM   "voice_stream"
#define CASA_MSG_VOICE_INPUT    "voice_input"
#define CASA_MSG_STATUS         "status"
#define CASA_MSG_MODE_CHANGE    "mode_change"
#define CASA_MSG_MODE_SELECT    "mode_select"
#define CASA_MSG_CONNECT        "connect"
#define CASA_MSG_BATTERY        "battery"

/* Device operational states reported to the frontend */
typedef enum {
    CASA_STATE_OFFLINE = 0,
    CASA_STATE_ONLINE,
    CASA_STATE_LISTENING,
    CASA_STATE_SPEAKING,
} casa_state_t;

/* Generic message envelope used by most queues */
typedef struct {
    uint16_t len;
    uint8_t  payload[CASA_MAX_PCM_BYTES];
} casa_message_t;

/* Specialized queue item for JSON/control traffic */
typedef struct {
    char json[CASA_MAX_JSON_BYTES];
} casa_json_msg_t;

/* Power-command enumeration */
typedef enum {
    POWER_CMD_NONE = 0,
    POWER_CMD_SLEEP,
    POWER_CMD_KILL,
    POWER_CMD_TIMEOUT,
} casa_power_cmd_t;

/* Global device state, protected by g_state_mutex */
typedef struct {
    casa_state_t state;
    char         character[32];
    char         mode[32];
    uint8_t      battery_pct;
} casa_global_state_t;

/* Global queue handles */
extern QueueHandle_t g_voice_tx_queue;     /* device -> server voice_stream JSON */
extern QueueHandle_t g_pcm_rx_queue;       /* server -> device PCM audio */
extern QueueHandle_t g_control_tx_queue;   /* device -> server JSON control/status */
extern QueueHandle_t g_control_rx_queue;   /* server -> device JSON control */
extern QueueHandle_t g_ble_queue;
extern QueueHandle_t g_power_cmd_queue;

/* Global event group and state mutex */
extern EventGroupHandle_t g_system_event_group;
extern SemaphoreHandle_t  g_state_mutex;
extern casa_global_state_t g_casa_state;

/* Utility helpers */
const char *casa_state_to_str(casa_state_t state);
void casa_set_state(casa_state_t state);
void casa_set_character(const char *character);
void casa_set_mode(const char *mode);
void casa_set_battery_pct(uint8_t pct);
bool casa_get_character(char *out, size_t out_len);
bool casa_get_mode(char *out, size_t out_len);

int casa_base64_encode(char *out, size_t out_len, size_t *olen,
                       const uint8_t *in, size_t in_len);
int casa_base64_decode(uint8_t *out, size_t out_len, size_t *olen,
                       const char *in, size_t in_len);

#ifdef __cplusplus
}
#endif

#endif /* CASA_COMMON_H */
