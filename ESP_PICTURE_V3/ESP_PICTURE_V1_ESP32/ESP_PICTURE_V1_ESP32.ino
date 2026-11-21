/* ESP_PICTURE_V2 for the classic dual-core ESP32, fixed at 240 MHz.
 * UART0 GPIO1/TX and GPIO3/RX connect to the external USB-UART bridge.
 */
#include <Arduino.h>
#include <esp_arduino_version.h>
#include "src/arduino_runtime.h"
#if !CONFIG_IDF_TARGET_ESP32
#error "Select ESP32 Dev Module"
#endif
#if ESP_ARDUINO_VERSION != ESP_ARDUINO_VERSION_VAL(3,3,12)
#error "Use Espressif Arduino-ESP32 3.3.12"
#endif
extern "C" void esp_picture_run();
void setup() {
    if(e32_arduino_runtime_prepare()!=ESP_OK)for(;;)delay(1000);
    esp_picture_run();
}
void loop() {delay(1000);}
