/* i2s_dual.h — Dual I2S Controller Config (ESP32-S3)
 *
 * I2S0: TX only → Speaker (MAX98357A)
 * I2S1: RX only → Microphone (INMP441)
 * Each controller has independent BCLK, WS, and data pins.
 * DO NOT share BCLK/WS between TX and RX.
 */

#ifndef I2S_DUAL_H
#define I2S_DUAL_H

#include <stdint.h>
#include <stddef.h>
#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

/* Pin Configuration — adjust for your board */
#define I2S0_TX_BCLK_PIN        4
#define I2S0_TX_WS_PIN          5
#define I2S0_TX_DOUT_PIN        6

#define I2S1_RX_BCLK_PIN        7
#define I2S1_RX_WS_PIN          15
#define I2S1_RX_DIN_PIN         16

/* Audio parameters */
#define I2S_SAMPLE_RATE         16000
#define I2S_BITS_PER_SAMPLE     16
#define I2S_CHANNELS            1

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t i2s_dual_init(int sample_rate);

/* TX (I2S0 — Speaker) */
esp_err_t i2s_tx_write(const void *src, size_t size, size_t *bytes_written, TickType_t ticks_to_wait);
esp_err_t i2s_tx_stop(void);

/* RX (I2S1 — Microphone) */
esp_err_t i2s_rx_read(void *dest, size_t size, size_t *bytes_read, TickType_t ticks_to_wait);

#ifdef __cplusplus
}
#endif

#endif /* I2S_DUAL_H */
