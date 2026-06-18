#include <string.h>
#include <stdio.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "driver/i2c.h"

#include "common.h"
#include "nfc_task.h"

static const char *TAG = "nfc";

#define PN532_I2C_ADDR_7BIT     0x24
#define PN532_I2C_ADDR_WRITE    ((PN532_I2C_ADDR_7BIT << 1) | I2C_MASTER_WRITE)
#define PN532_I2C_ADDR_READ     ((PN532_I2C_ADDR_7BIT << 1) | I2C_MASTER_READ)

#define PN532_PREAMBLE          0x00
#define PN532_STARTCODE_1       0x00
#define PN532_STARTCODE_2       0xFF
#define PN532_HOST_TO_PN532     0xD4
#define PN532_PN532_TO_HOST     0xD5

#define PN532_CMD_GETFIRMWAREVERSION  0x02
#define PN532_CMD_INLISTPASSIVETARGET 0x4A

typedef enum {
    NFC_STATE_INIT,
    NFC_STATE_PROBE,
    NFC_STATE_SCAN,
    NFC_STATE_READ,
    NFC_STATE_ERROR,
    NFC_STATE_RETRY,
} nfc_state_t;

static void nfc_i2c_init(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = CONFIG_CASA_PN532_SDA,
        .scl_io_num = CONFIG_CASA_PN532_SCL,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 100000,
    };
    i2c_param_config(CONFIG_CASA_PN532_I2C_PORT, &conf);
    ESP_ERROR_CHECK(i2c_driver_install(CONFIG_CASA_PN532_I2C_PORT, conf.mode, 0, 0, 0));
}

static int pn532_write_frame(uint8_t cmd_code, const uint8_t *data, uint8_t data_len)
{
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, PN532_I2C_ADDR_WRITE, true);

    i2c_master_write_byte(cmd, PN532_PREAMBLE, true);
    i2c_master_write_byte(cmd, PN532_STARTCODE_1, true);
    i2c_master_write_byte(cmd, PN532_STARTCODE_2, true);

    uint8_t len = data_len + 1; /* TFI + data */
    i2c_master_write_byte(cmd, len, true);
    i2c_master_write_byte(cmd, (uint8_t)(~len + 1), true); /* LCS */

    i2c_master_write_byte(cmd, PN532_HOST_TO_PN532, true);

    uint8_t dcs = PN532_HOST_TO_PN532 + cmd_code;
    i2c_master_write_byte(cmd, cmd_code, true);
    for (uint8_t i = 0; i < data_len; i++) {
        i2c_master_write_byte(cmd, data[i], true);
        dcs += data[i];
    }
    i2c_master_write_byte(cmd, (uint8_t)(~dcs + 1), true); /* DCS */
    i2c_master_write_byte(cmd, PN532_PREAMBLE, true);      /* postamble */

    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(CONFIG_CASA_PN532_I2C_PORT, cmd, pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    return (err == ESP_OK) ? 0 : -1;
}

static int pn532_wait_ready(void)
{
    for (int i = 0; i < 20; i++) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, PN532_I2C_ADDR_READ, true);
        uint8_t ready = 0;
        i2c_master_read_byte(cmd, &ready, I2C_MASTER_LAST_NACK);
        i2c_master_stop(cmd);
        esp_err_t err = i2c_master_cmd_begin(CONFIG_CASA_PN532_I2C_PORT, cmd, pdMS_TO_TICKS(50));
        i2c_cmd_link_delete(cmd);
        if (err == ESP_OK && ready == 0x01) {
            return 0;
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    return -1;
}

static int pn532_read_response(uint8_t *resp, uint8_t max_len, uint8_t *out_len)
{
    if (pn532_wait_ready() != 0) {
        return -1;
    }

    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, PN532_I2C_ADDR_READ, true);

    uint8_t buf[4];
    i2c_master_read(cmd, buf, 3, I2C_MASTER_ACK);       /* preamble */
    i2c_master_read_byte(cmd, &buf[3], I2C_MASTER_ACK); /* len */
    uint8_t lcs;
    i2c_master_read_byte(cmd, &lcs, I2C_MASTER_ACK);
    uint8_t tfi;
    i2c_master_read_byte(cmd, &tfi, I2C_MASTER_ACK);

    if (buf[0] != 0x00 || buf[1] != 0x00 || buf[2] != 0xFF || tfi != PN532_PN532_TO_HOST) {
        i2c_master_stop(cmd);
        i2c_master_cmd_begin(CONFIG_CASA_PN532_I2C_PORT, cmd, pdMS_TO_TICKS(100));
        i2c_cmd_link_delete(cmd);
        return -1;
    }

    uint8_t data_len = (buf[3] > 0) ? (buf[3] - 1) : 0;
    if (data_len > max_len) {
        data_len = max_len;
    }
    for (uint8_t i = 0; i < data_len; i++) {
        i2c_master_read_byte(cmd, &resp[i], I2C_MASTER_ACK);
    }
    /* Skip any response bytes that do not fit in the caller buffer. */
    for (uint8_t i = data_len; i < buf[3] - 1; i++) {
        i2c_master_read_byte(cmd, &buf[0], I2C_MASTER_ACK);
    }
    uint8_t dcs;
    i2c_master_read_byte(cmd, &dcs, I2C_MASTER_ACK);
    uint8_t post;
    i2c_master_read_byte(cmd, &post, I2C_MASTER_NACK);

    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(CONFIG_CASA_PN532_I2C_PORT, cmd, pdMS_TO_TICKS(200));
    i2c_cmd_link_delete(cmd);
    if (err != ESP_OK) {
        return -1;
    }

    *out_len = data_len;
    return 0;
}

static bool pn532_get_firmware_version(uint8_t *ic, uint8_t *ver, uint8_t *rev)
{
    if (pn532_write_frame(PN532_CMD_GETFIRMWAREVERSION, NULL, 0) != 0) {
        return false;
    }
    uint8_t resp[16];
    uint8_t len = 0;
    if (pn532_read_response(resp, sizeof(resp), &len) != 0) {
        return false;
    }
    if (len >= 3) {
        *ic = resp[0];
        *ver = resp[1];
        *rev = resp[2];
        return true;
    }
    return false;
}

static bool pn532_poll_passive_target(uint8_t *uid, uint8_t *uid_len)
{
    uint8_t params[] = {0x01, 0x00}; /* one card, Type A */
    if (pn532_write_frame(PN532_CMD_INLISTPASSIVETARGET, params, sizeof(params)) != 0) {
        return false;
    }
    uint8_t resp[32];
    uint8_t len = 0;
    if (pn532_read_response(resp, sizeof(resp), &len) != 0) {
        return false;
    }
    /* Response: 4B <count> <tg> <sens_res> <sel_res> <uid_len> <uid...> */
    if (len < 6 || resp[0] != 0x4B || resp[1] == 0) {
        return false;
    }
    *uid_len = resp[5];
    if (*uid_len > 7) {
        *uid_len = 7;
    }
    if (*uid_len > len - 6) {
        *uid_len = len - 6;
    }
    memcpy(uid, &resp[6], *uid_len);
    return true;
}

static void nfc_send_medallion(const uint8_t *uid, uint8_t uid_len)
{
    casa_json_msg_t msg = {0};
    char uid_hex[32] = {0};
    for (uint8_t i = 0; i < uid_len && (i * 2) < sizeof(uid_hex) - 2; i++) {
        snprintf(uid_hex + i * 2, sizeof(uid_hex) - i * 2, "%02X", uid[i]);
    }

    /* Map the UID to a character/mode pair. Replace with your own NFC database. */
    const char *character = CONFIG_CASA_WAKE_WORD_PRIMARY;
    const char *mode = "default";

    if (g_control_tx_queue == NULL) {
        ESP_LOGE(TAG, "Control TX queue not ready");
        return;
    }
    snprintf(msg.json, sizeof(msg.json),
             "{\"type\":\"medallion\",\"character_key\":\"%s\",\"mode_key\":\"%s\","
             "\"uid\":\"%s\"}",
             character, mode, uid_hex);
    xQueueSend(g_control_tx_queue, &msg, 0);
    ESP_LOGI(TAG, "Medallion tapped: %s", uid_hex);
}

static void nfc_task(void *pvParameters)
{
    (void)pvParameters;
    nfc_state_t state = NFC_STATE_INIT;

    while (1) {
        switch (state) {
        case NFC_STATE_INIT:
            nfc_i2c_init();
            state = NFC_STATE_PROBE;
            break;

        case NFC_STATE_PROBE: {
            uint8_t ic = 0, ver = 0, rev = 0;
            if (pn532_get_firmware_version(&ic, &ver, &rev)) {
                ESP_LOGI(TAG, "PN532 found: ic=0x%02X ver=%u rev=%u", ic, ver, rev);
                state = NFC_STATE_SCAN;
            } else {
                ESP_LOGW(TAG, "PN532 not responding, will retry");
                state = NFC_STATE_RETRY;
            }
            break;
        }

        case NFC_STATE_SCAN: {
            uint8_t uid[8] = {0};
            uint8_t uid_len = 0;
            if (pn532_poll_passive_target(uid, &uid_len)) {
                nfc_send_medallion(uid, uid_len);
                vTaskDelay(pdMS_TO_TICKS(2000)); /* Debounce */
            }
            break;
        }

        case NFC_STATE_ERROR:
            ESP_LOGW(TAG, "NFC error, reinitialising");
            i2c_driver_delete(CONFIG_CASA_PN532_I2C_PORT);
            state = NFC_STATE_INIT;
            break;

        case NFC_STATE_RETRY:
        default:
            vTaskDelay(pdMS_TO_TICKS(1000));
            state = NFC_STATE_PROBE;
            break;
        }

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

void nfc_task_start(void)
{
    xTaskCreate(nfc_task, "nfc_task", 4096, NULL, 5, NULL);
}
