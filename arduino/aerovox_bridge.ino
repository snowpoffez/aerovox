// AeroVox Arduino bridge sketch
// Receives simple serial commands from a desktop bridge.

#include <Arduino.h>

const int LED_PIN = LED_BUILTIN;

void handleCommand(const String& command) {
  if (command == "THROTTLE_UP") {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("ACK THROTTLE_UP");
  } else if (command == "THROTTLE_DOWN") {
    digitalWrite(LED_PIN, LOW);
    Serial.println("ACK THROTTLE_DOWN");
  } else if (command == "TURN_LEFT") {
    Serial.println("ACK TURN_LEFT");
  } else if (command == "TURN_RIGHT") {
    Serial.println("ACK TURN_RIGHT");
  } else if (command == "YES") {
    Serial.println("ACK YES");
  } else if (command == "NO") {
    Serial.println("ACK NO");
  } else {
    Serial.print("UNKNOWN ");
    Serial.println(command);
  }
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  while (!Serial) {
    ;
  }
  Serial.println("AeroVox Arduino bridge ready");
}

void loop() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command.length() > 0) {
      handleCommand(command);
    }
  }
}
