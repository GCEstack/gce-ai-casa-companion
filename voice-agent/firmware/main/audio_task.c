#include <string.h>
#include <stdio.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "driver/i2s.h"
#include "driver/gpio.h"

#include "common.h"
#include "audio_task.h"

static const char *TAG = "audio";

static void i2s_mic_init(void)
{
    i2s_config_t cfg = {
        .mode = I2S_MODE_MASTER | I2S_MODE_RX,
        .sample_rate = CASA_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_I2S_MSB,
        .dma_buf_count = 4,
        .dma_buf_len = CASA_SAMPLES_PER_FRAME,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .use_apll = false,
    };
    i2s_pin_config_t pins = {
        .bck_io_num = CONFIG_CASA_I2S_MIC_BCK,
        .ws_io_num = CONFIG_CASA_I2S_MIC_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = CONFIG_CASA_I2S_MIC_DATA,
    };
    ESP_ERROR_CHECK(i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_NUM_0, &pins));
    ESP_LOGI(TAG, "Microphone I2S initialized (rate=%d, samples=%d)",
             CASA_SAMPLE_RATE, CASA_SAMPLES_PER_FRAME);
}

static void i2s_spk_init(void)
{
    i2s_config_t cfg = {
        .mode = I2S_MODE_MASTER | I2S_MODE_TX,
        .sample_rate = CASA_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_I2S_MSB,
        .dma_buf_count = 4,
        .dma_buf_len = CASA_SAMPLES_PER_FRAME,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .use_apll = false,
    };
    i2s_pin_config_t pins = {
        .bck_io_num = CONFIG_CASA_I2S_SPK_BCK,
        .ws_io_num = CONFIG_CASA_I2S_SPK_WS,
        .data_out_num = CONFIG_CASA_I2S_SPK_DATA,
        .data_in_num = I2S_PIN_NO_CHANGE,
    };
    ESP_ERROR_CHECK(i2s_driver_install(I2S_NUM_1, &cfg, 0, NULL));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_NUM_1, &pins));
    ESP_LOGI(TAG, "Speaker I2S initialized");
}

static void build_voice_stream_json(const int16_t *pcm, size_t pcm_bytes,
                                    casa_json_msg_t *msg)
{
    char b64[CASA_MAX_B64_BYTES];
    size_t b64_len = 0;

    int err = casa_base64_encode(b64, sizeof(b64), &b64_len,
                                 (const uint8_t *)pcm, pcm_bytes);
    if (err != 0) {
        ESP_LOGE(TAG, "Base64 encode failed: %d", err);
        msg->json[0] = '\0';
        return;
    }
    b64[b64_len] = '\0';

    char character[32] = {0};
    casa_get_character(character, sizeof(character));

    snprintf(msg->json, sizeof(msg->json),
             "{\"type\":\"%s\",\"data\":\"%s\",\"character\":\"%s\"}",
             CASA_MSG_VOICE_STREAM, b64, character);
}

static void audio_tx_task(void *pvParameters)
{
    (void)pvParameters;
    int16_t *pcm = heap_caps_malloc(CASA_BYTES_PER_FRAME, MALLOC_CAP_DMA);
    if (pcm == NULL) {
        ESP_LOGE(TAG, "Failed to allocate mic DMA buffer");
        vTaskDelete(NULL);
        return;
    }

    while (1) {
        xEventGroupWaitBits(g_system_event_group,
                            WW_DETECTED_BIT | LISTENING_BIT,
                            pdFALSE, pdFALSE, portMAX_DELAY);

        casa_set_state(CASA_STATE_LISTENING);

        while ((xEventGroupGetBits(g_system_event_group) & (WW_DETECTED_BIT | LISTENING_BIT)) != 0) {
            size_t bytes_read = 0;
            esp_err_t err = i2s_read(I2S_NUM_0, pcm, CASA_BYTES_PER_FRAME,
                                     &bytes_read, pdMS_TO_TICKS(100));
            if (err != ESP_OK || bytes_read != CASA_BYTES_PER_FRAME) {
                continue;
            }

            casa_json_msg_t msg = {0};
            build_voice_stream_json(pcm, CASA_BYTES_PER_FRAME, &msg);
            if (msg.json[0] != '\0') {
                xQueueSend(g_voice_tx_queue, &msg, 0);
            }
        }

        casa_set_state(CASA_STATE_ONLINE);
    }
}

static void audio_rx_task(void *pvParameters)
{
    (void)pvParameters;
    while (1) {
        casa_message_t msg = {0};
        if (xQueueReceive(g_pcm_rx_queue, &msg, pdMS_TO_TICKS(100)) == pdTRUE) {
            size_t written = 0;
            esp_err_t err = i2s_write(I2S_NUM_1, msg.payload, msg.len,
                                      &written, pdMS_TO_TICKS(500));
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Speaker write failed: %d", err);
            }
        }
    }
}

void audio_task_start(void)
{
    i2s_mic_init();
    i2s_spk_init();

    xTaskCreate(audio_tx_task, "audio_tx_task", 8192, NULL, 5, NULL);
    xTaskCreate(audio_rx_task, "audio_rx_task", 4096, NULL, 5, NULL);

    ESP_LOGI(TAG, "Audio tasks started");
}
