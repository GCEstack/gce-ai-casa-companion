#include <string.h>
#include "common.h"
#include "mbedtls/base64.h"

const char *casa_state_to_str(casa_state_t state)
{
    switch (state) {
    case CASA_STATE_OFFLINE:   return "offline";
    case CASA_STATE_ONLINE:    return "online";
    case CASA_STATE_LISTENING: return "listening";
    case CASA_STATE_SPEAKING:  return "speaking";
    default:                   return "unknown";
    }
}

void casa_set_state(casa_state_t state)
{
    if (g_state_mutex == NULL) {
        g_casa_state.state = state;
        return;
    }
    if (xSemaphoreTake(g_state_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        g_casa_state.state = state;
        xSemaphoreGive(g_state_mutex);
    }
}

void casa_set_character(const char *character)
{
    if (character == NULL) {
        return;
    }
    if (g_state_mutex == NULL) {
        strncpy(g_casa_state.character, character, sizeof(g_casa_state.character) - 1);
        g_casa_state.character[sizeof(g_casa_state.character) - 1] = '\0';
        return;
    }
    if (xSemaphoreTake(g_state_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        strncpy(g_casa_state.character, character, sizeof(g_casa_state.character) - 1);
        g_casa_state.character[sizeof(g_casa_state.character) - 1] = '\0';
        xSemaphoreGive(g_state_mutex);
    }
}

void casa_set_mode(const char *mode)
{
    if (mode == NULL) {
        return;
    }
    if (g_state_mutex == NULL) {
        strncpy(g_casa_state.mode, mode, sizeof(g_casa_state.mode) - 1);
        g_casa_state.mode[sizeof(g_casa_state.mode) - 1] = '\0';
        return;
    }
    if (xSemaphoreTake(g_state_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        strncpy(g_casa_state.mode, mode, sizeof(g_casa_state.mode) - 1);
        g_casa_state.mode[sizeof(g_casa_state.mode) - 1] = '\0';
        xSemaphoreGive(g_state_mutex);
    }
}

void casa_set_battery_pct(uint8_t pct)
{
    if (g_state_mutex == NULL) {
        g_casa_state.battery_pct = pct;
        return;
    }
    if (xSemaphoreTake(g_state_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        g_casa_state.battery_pct = pct;
        xSemaphoreGive(g_state_mutex);
    }
}

bool casa_get_character(char *out, size_t out_len)
{
    if (out == NULL || out_len == 0) {
        return false;
    }
    bool ok = false;
    if (g_state_mutex == NULL || xSemaphoreTake(g_state_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        strncpy(out, g_casa_state.character, out_len - 1);
        out[out_len - 1] = '\0';
        ok = true;
        if (g_state_mutex != NULL) {
            xSemaphoreGive(g_state_mutex);
        }
    }
    return ok;
}

bool casa_get_mode(char *out, size_t out_len)
{
    if (out == NULL || out_len == 0) {
        return false;
    }
    bool ok = false;
    if (g_state_mutex == NULL || xSemaphoreTake(g_state_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        strncpy(out, g_casa_state.mode, out_len - 1);
        out[out_len - 1] = '\0';
        ok = true;
        if (g_state_mutex != NULL) {
            xSemaphoreGive(g_state_mutex);
        }
    }
    return ok;
}

int casa_base64_encode(char *out, size_t out_len, size_t *olen,
                       const uint8_t *in, size_t in_len)
{
    return mbedtls_base64_encode((unsigned char *)out, out_len, olen, in, in_len);
}

int casa_base64_decode(uint8_t *out, size_t out_len, size_t *olen,
                       const char *in, size_t in_len)
{
    return mbedtls_base64_decode(out, out_len, olen, (const unsigned char *)in, in_len);
}
