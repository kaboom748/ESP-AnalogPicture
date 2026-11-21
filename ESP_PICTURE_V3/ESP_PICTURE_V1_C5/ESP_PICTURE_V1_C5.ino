/* ESP-AnalogPicture / ESP_PICTURE_V1 — ESP32-C5.
 * Picture HTML and V12 wire protocol at 1.5 Mbaud, UART0 through CP210x.
 * Stock Espressif Arduino-ESP32 3.3.12, native ADC10 IQ and FM NCO.
 */
#include <Arduino.h>
#include <esp_arduino_version.h>
#include "src/arduino_runtime.h"
#if !CONFIG_IDF_TARGET_ESP32C5
#error "Select ESP32C5 Dev Module"
#endif
#if ESP_ARDUINO_VERSION != ESP_ARDUINO_VERSION_VAL(3,3,12)
#error "Use Espressif Arduino-ESP32 3.3.12"
#endif
extern "C" void esp_picture_run();
void setup() {
    if(c5_arduino_runtime_prepare()!=ESP_OK)for(;;)delay(1000);
    esp_picture_run();
}
void loop() {delay(1000);}
