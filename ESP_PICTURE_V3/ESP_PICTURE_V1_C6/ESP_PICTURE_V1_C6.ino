/* ESP-AnalogPicture / ESP_PICTURE_V2 — ESP32-C6.
 * Picture V12 wire protocol at 1.5 Mbaud through the external CH343 USB-UART.
 * Stock Espressif Arduino-ESP32 3.3.12, native ADC10 IQ and FM NCO.
 */
#include <Arduino.h>
#include <esp_arduino_version.h>
#include "src/arduino_runtime.h"

#if !CONFIG_IDF_TARGET_ESP32C6
#error "Select ESP32C6 Dev Module"
#endif
#if ESP_ARDUINO_VERSION != ESP_ARDUINO_VERSION_VAL(3,3,12)
#error "Use Espressif Arduino-ESP32 3.3.12"
#endif

extern "C" void esp_picture_run();

void setup() {
    if (c6_arduino_runtime_prepare() != ESP_OK) for (;;) delay(1000);
    esp_picture_run();
}

void loop() { delay(1000); }
