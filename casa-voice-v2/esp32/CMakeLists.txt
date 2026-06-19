cmake_minimum_required(VERSION 3.16)

# Target: ESP32-S3
set(IDF_TARGET esp32s3)
set(EXTRA_COMPONENT_DIRS $ENV{IDF_PATH}/examples/common_components/protocol_examples_common)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(casa_voice_v2)
