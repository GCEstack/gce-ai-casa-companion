/* i2s_dual.c — I2S0 TX + I2S1 RX Implementation
 *
 * Uses ESP-IDF I2S driver v5.x with separate controller configs.
 * I2S0: Standard I2S mode, TX channel, 16-bit, mono, 16kHz
 * I2S1: Standard I2S mode, RX channel, 16-bit, mono, 16kHz
 */

#include "i2s_dual.h"
#include "driver/i2s_std.h"
#include "esp_log.h"
#include "esp_err.h"

static const char *TAG = "I2S_DUAL";

static i2s_chan_handle_t i2s0_tx_handle = NULL;  /* Speaker */
static i2s_chan_handle_t i2s1_rx_handle = NULL;  /* Microphone */

esp_err_t i2s_dual_init(int sample_rate)
{
    esp_err_t ret;

    /* ── I2S0: TX Channel (Speaker) ── */
    i2s_chan_config_t i2s0_chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    i2s0_chan_cfg.auto_clear = true;

    ret = i2s_new_channel(&i2s0_chan_cfg, &i2s0_tx_handle, NULL);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2S0 channel creation failed: %s", esp_err_to_name(ret));
        return ret;
    }

    i2s_std_config_t i2s0_std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(sample_rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S0_TX_BCLK_PIN,
            .ws = I2S0_TX_WS_PIN,
            .dout = I2S0_TX_DOUT_PIN,
            .din = I2S_GPIO_UNUSED,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    ret = i2s_channel_init_std_mode(i2s0_tx_handle, &i2s0_std_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2S0 init failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ret = i2s_channel_enable(i2s0_tx_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2S0 enable failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "I2S0 TX initialized: BCLK=%d, WS=%d, DOUT=%d",
             I2S0_TX_BCLK_PIN, I2S0_TX_WS_PIN, I2S0_TX_DOUT_PIN);

    /* ── I2S1: RX Channel (Microphone) ── */
    i2s_chan_config_t i2s1_chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
    i2s1_chan_cfg.auto_clear = true;

    ret = i2s_new_channel(&i2s1_chan_cfg, NULL, &i2s1_rx_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2S1 channel creation failed: %s", esp_err_to_name(ret));
        return ret;
    }

    i2s_std_config_t i2s1_std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(sample_rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S1_RX_BCLK_PIN,
            .ws = I2S1_RX_WS_PIN,
            .dout = I2S_GPIO_UNUSED,
            .din = I2S1_RX_DIN_PIN,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    ret = i2s_channel_init_std_mode(i2s1_rx_handle, &i2s1_std_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2S1 init failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ret = i2s_channel_enable(i2s1_rx_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2S1 enable failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "I2S1 RX initialized: BCLK=%d, WS=%d, DIN=%d",
             I2S1_RX_BCLK_PIN, I2S1_RX_WS_PIN, I2S1_RX_DIN_PIN);

    ESP_LOGI(TAG, "Dual I2S ready. Sample rate=%d Hz, 16-bit, mono", sample_rate);
    return ESP_OK;
}

esp_err_t i2s_tx_write(const void *src, size_t size, size_t *bytes_written, TickType_t ticks_to_wait)
{
    if (i2s0_tx_handle == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    return i2s_channel_write(i2s0_tx_handle, src, size, bytes_written, ticks_to_wait);
}

esp_err_t i2s_tx_stop(void)
{
    if (i2s0_tx_handle == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    /* Disable → clear buffer → re-enable for next playback */
    esp_err_t ret = i2s_channel_disable(i2s0_tx_handle);
    if (ret != ESP_OK) return ret;

    ret = i2s_channel_enable(i2s0_tx_handle);
    return ret;
}

esp_err_t i2s_rx_read(void *dest, size_t size, size_t *bytes_read, TickType_t ticks_to_wait)
{
    if (i2s1_rx_handle == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    return i2s_channel_read(i2s1_rx_handle, dest, size, bytes_read, ticks_to_wait);
}
