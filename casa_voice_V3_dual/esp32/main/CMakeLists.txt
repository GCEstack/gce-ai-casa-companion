idf_component_register(
    SRCS
        "main.c"
        "wifi.c"
        "websocket.c"
        "i2s_dual.c"
        "vad.c"
    INCLUDE_DIRS "."
    REQUIRES
        freertos
        driver
        esp_wifi
        nvs_flash
        esp_event
        esp_websocket_client
        json
)
