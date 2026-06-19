#include <string.h>
#include <stdio.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"

#include "common.h"
#include "ble_task.h"

static const char *TAG = "ble";

#define PROFILE_APP_IDX             0
#define GATTS_SERVICE_UUID          0x00FF
#define GATTS_CHAR_UUID             0xFF01
#define GATTS_NUM_HANDLES           4

#define ADV_CONFIG_FLAG             (1 << 0)
#define SCAN_RSP_CONFIG_FLAG        (1 << 1)

static uint8_t s_adv_config_done = 0;
static uint8_t s_char_value[64] = {0};

static esp_attr_value_t gatts_attr_val = {
    .attr_max_len = sizeof(s_char_value),
    .attr_len     = 1,
    .attr_value   = s_char_value,
};

static uint8_t adv_service_uuid128[16] = {
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80,
    0x00, 0x10, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00,
};

static esp_ble_adv_params_t adv_params = {
    .adv_int_min        = 0x20,
    .adv_int_max        = 0x40,
    .adv_type           = ADV_TYPE_IND,
    .own_addr_type      = BLE_ADDR_TYPE_PUBLIC,
    .peer_addr_type     = BLE_ADDR_TYPE_PUBLIC,
    .channel_map        = ADV_CHNL_ALL,
    .adv_filter_policy  = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY,
};

static esp_ble_adv_data_t adv_data = {
    .set_scan_rsp        = false,
    .include_name        = true,
    .include_txpower     = true,
    .min_interval        = 0x0006,
    .max_interval        = 0x0010,
    .appearance          = 0x00,
    .manufacturer_len    = 0,
    .p_manufacturer_data = NULL,
    .service_data_len    = 0,
    .p_service_data      = NULL,
    .service_uuid_len    = sizeof(adv_service_uuid128),
    .p_service_uuid      = adv_service_uuid128,
    .flag                = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT),
};

static esp_ble_adv_data_t scan_rsp_data = {
    .set_scan_rsp        = true,
    .include_name        = true,
    .include_txpower     = true,
    .min_interval        = 0x0006,
    .max_interval        = 0x0010,
    .appearance          = 0x00,
    .manufacturer_len    = 0,
    .p_manufacturer_data = NULL,
    .service_data_len    = 0,
    .p_service_data      = NULL,
    .service_uuid_len    = sizeof(adv_service_uuid128),
    .p_service_uuid      = adv_service_uuid128,
    .flag                = (ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT),
};

static struct gatts_profile_inst {
    esp_gatts_cb_t gatts_cb;
    uint16_t gatts_if;
    uint16_t app_id;
    uint16_t conn_id;
    uint16_t service_handle;
    esp_gatt_srvc_id_t service_id;
    uint16_t char_handle;
    esp_bt_uuid_t char_uuid;
} gl_profile;

static void gatts_profile_event_handler(esp_gatts_cb_event_t event,
                                        esp_gatt_if_t gatts_if,
                                        esp_ble_gatts_cb_param_t *param);

static void send_ble_data_to_websocket(const uint8_t *data, uint16_t len)
{
    if (g_control_tx_queue == NULL) {
        ESP_LOGE(TAG, "Control TX queue not ready");
        return;
    }
    casa_json_msg_t msg = {0};
    snprintf(msg.json, sizeof(msg.json),
             "{\"type\":\"tap_board\",\"len\":%u,\"data\":\"", len);
    size_t pos = strlen(msg.json);
    for (uint16_t i = 0; i < len && pos + 2 < sizeof(msg.json) - 2; i++) {
        snprintf(msg.json + pos, sizeof(msg.json) - pos, "%02X", data[i]);
        pos += 2;
    }
    if (pos + 2 < sizeof(msg.json)) {
        msg.json[pos] = '"';
        msg.json[pos + 1] = '}';
        msg.json[pos + 2] = '\0';
    } else {
        msg.json[sizeof(msg.json) - 1] = '\0';
    }
    xQueueSend(g_control_tx_queue, &msg, 0);
}

static void gatts_profile_event_handler(esp_gatts_cb_event_t event,
                                        esp_gatt_if_t gatts_if,
                                        esp_ble_gatts_cb_param_t *param)
{
    switch (event) {
    case ESP_GATTS_REG_EVT:
        ESP_LOGI(TAG, "GATTS register, status=%d, app_id=%d",
                 param->reg.status, param->reg.app_id);
        gl_profile.service_id.is_primary = true;
        gl_profile.service_id.id.inst_id = 0x00;
        gl_profile.service_id.id.uuid.len = ESP_UUID_LEN_16;
        gl_profile.service_id.id.uuid.uuid.uuid16 = GATTS_SERVICE_UUID;

        esp_ble_gatts_create_service(gatts_if, &gl_profile.service_id, GATTS_NUM_HANDLES);
        break;

    case ESP_GATTS_CREATE_EVT:
        ESP_LOGI(TAG, "Service created, handle=%d", param->create.service_handle);
        gl_profile.service_handle = param->create.service_handle;

        gl_profile.char_uuid.len = ESP_UUID_LEN_16;
        gl_profile.char_uuid.uuid.uuid16 = GATTS_CHAR_UUID;

        esp_ble_gatts_start_service(gl_profile.service_handle);

        esp_attr_control_t control = { .auto_rsp = ESP_GATT_AUTO_RSP };
        esp_ble_gatts_add_char(gl_profile.service_handle,
                               &gl_profile.char_uuid,
                               ESP_GATT_PERM_WRITE,
                               ESP_GATT_CHAR_PROP_BIT_WRITE,
                               &gatts_attr_val,
                               &control);
        break;

    case ESP_GATTS_ADD_CHAR_EVT: {
        uint16_t length = 0;
        const uint8_t *prf_char;
        ESP_LOGI(TAG, "Characteristic add, status=%d, attr_handle=%d",
                 param->add_char.status, param->add_char.attr_handle);
        gl_profile.char_handle = param->add_char.attr_handle;

        esp_ble_gatts_get_attr_value(param->add_char.attr_handle, &length, &prf_char);
        ESP_LOGI(TAG, "Char length=%d", length);
        break;
    }

    case ESP_GATTS_WRITE_EVT:
        ESP_LOGI(TAG, "GATT write, handle=%d, len=%d", param->write.handle, param->write.len);
        if (!param->write.is_prep && param->write.len > 0) {
            send_ble_data_to_websocket(param->write.value, param->write.len);
        }
        esp_ble_gatts_send_response(gatts_if, param->write.conn_id,
                                    param->write.trans_id, ESP_GATT_OK, NULL);
        break;

    case ESP_GATTS_CONNECT_EVT:
        ESP_LOGI(TAG, "BLE client connected, conn_id=%d", param->connect.conn_id);
        gl_profile.conn_id = param->connect.conn_id;
        break;

    case ESP_GATTS_DISCONNECT_EVT:
        ESP_LOGI(TAG, "BLE client disconnected, reason=%d", param->disconnect.reason);
        esp_ble_gap_start_advertising(&adv_params);
        break;

    default:
        break;
    }
}

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT:
        s_adv_config_done &= (~ADV_CONFIG_FLAG);
        if (s_adv_config_done == 0) {
            esp_ble_gap_start_advertising(&adv_params);
        }
        break;
    case ESP_GAP_BLE_SCAN_RSP_DATA_SET_COMPLETE_EVT:
        s_adv_config_done &= (~SCAN_RSP_CONFIG_FLAG);
        if (s_adv_config_done == 0) {
            esp_ble_gap_start_advertising(&adv_params);
        }
        break;
    case ESP_GAP_BLE_ADV_START_COMPLETE_EVT:
        if (param->adv_start_cmpl.status != ESP_BT_STATUS_SUCCESS) {
            ESP_LOGE(TAG, "Advertising start failed: %d", param->adv_start_cmpl.status);
        } else {
            ESP_LOGI(TAG, "Advertising started");
        }
        break;
    default:
        break;
    }
}

static void gatts_event_handler(esp_gatts_cb_event_t event, esp_gatt_if_t gatts_if,
                                esp_ble_gatts_cb_param_t *param)
{
    if (event == ESP_GATTS_REG_EVT) {
        if (param->reg.status == ESP_GATT_OK) {
            gl_profile.gatts_if = gatts_if;
        } else {
            ESP_LOGE(TAG, "GATTS reg failed, status=%d", param->reg.status);
            return;
        }
    }

    if (gatts_if == ESP_GATT_IF_NONE || gatts_if == gl_profile.gatts_if) {
        gl_profile.gatts_cb(event, gatts_if, param);
    }
}

static void ble_task(void *pvParameters)
{
    (void)pvParameters;

    memset(&gl_profile, 0, sizeof(gl_profile));
    gl_profile.gatts_cb = gatts_profile_event_handler;
    gl_profile.gatts_if = ESP_GATT_IF_NONE;

    esp_err_t ret;
    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ret = esp_bt_controller_init(&bt_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "BT controller init failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    ret = esp_bt_controller_enable(ESP_BT_MODE_BLE);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "BT controller enable failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    ret = esp_bluedroid_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Bluedroid init failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    ret = esp_bluedroid_enable();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Bluedroid enable failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    ret = esp_ble_gatts_register_callback(gatts_event_handler);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GATTS register cb failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    ret = esp_ble_gap_register_callback(gap_event_handler);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GAP register cb failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    ret = esp_ble_gatts_app_register(PROFILE_APP_IDX);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GATTS app register failed: %s", esp_err_to_name(ret));
        vTaskDelete(NULL);
        return;
    }

    s_adv_config_done |= ADV_CONFIG_FLAG;
    s_adv_config_done |= SCAN_RSP_CONFIG_FLAG;

    esp_ble_gap_set_device_name(CONFIG_CASA_DEVICE_ID);
    esp_ble_gap_config_adv_data(&adv_data);
    esp_ble_gap_config_adv_data(&scan_rsp_data);

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void ble_task_start(void)
{
    xTaskCreate(ble_task, "ble_task", 8192, NULL, 5, NULL);
}
