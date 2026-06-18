set(_component_srcs
    "main.c"
    "common.c"
    "wifi_task.c"
    "websocket_task.c"
    "audio_task.c"
    "wake_word.c"
    "ble_task.c"
    "nfc_task.c"
    "power_mgmt.c"
)

set(_requires
    esp_timer
    esp_wifi
    esp_websocket_client
    nvs_flash
    driver
    bt
    mbedtls
)

if(CONFIG_CASA_USE_LIBOPUS)
    list(APPEND _requires opus)
endif()

idf_component_register(
    SRCS ${_component_srcs}
    INCLUDE_DIRS "."
    REQUIRES ${_requires}
)
