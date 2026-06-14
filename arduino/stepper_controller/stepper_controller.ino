#include <AccelStepper.h>

// 4096 steps per full 360-degree revolution for 28BYJ-48 in HALF4WIRE (8-step microstepping)
// Internal motor: 64 steps/rev in half-step * 64:1 gearbox = 4096 output steps/rev
const int STEPS_PER_REV = 4096;

// DC motor PWM control on pin 6
const int DC_MOTOR_PIN = 6;

// AccelStepper with HALF4WIRE driver for microstepping (8-step sequence)
// Pin order matches ULN2003 driver board wiring
AccelStepper stepper(AccelStepper::HALF4WIRE, 8, 10, 9, 11);

void setup() {
  Serial.begin(9600);

  // DC motor pin
  pinMode(DC_MOTOR_PIN, OUTPUT);
  analogWrite(DC_MOTOR_PIN, 0);

  // Max speed: 600 steps/sec = ~8.8 RPM output at 4096 steps/rev
  stepper.setMaxSpeed(600);

  // Acceleration ramp prevents jerk / oscillation
  stepper.setAcceleration(400);

  Serial.println("CONSOLE_BEARING:0.00");
}

void loop() {
  while (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.startsWith("STEPS:")) {
      int targetSteps = input.substring(6).toInt();

      targetSteps = ((targetSteps % STEPS_PER_REV) + STEPS_PER_REV) % STEPS_PER_REV;

      long currentPos = stepper.currentPosition();
      int currentInRange = ((currentPos % STEPS_PER_REV) + STEPS_PER_REV) % STEPS_PER_REV;
      int diff = targetSteps - currentInRange;
      if (diff > STEPS_PER_REV / 2) diff -= STEPS_PER_REV;
      else if (diff < -STEPS_PER_REV / 2) diff += STEPS_PER_REV;

      stepper.move(diff);

      float bearing = ((float)targetSteps / STEPS_PER_REV) * 360.0;
      Serial.print("CONSOLE_BEARING:");
      Serial.println(bearing);

    } else if (input.startsWith("SPEED:")) {
      int pwm = input.substring(6).toInt();
      pwm = constrain(pwm, 0, 255);
      analogWrite(DC_MOTOR_PIN, pwm);
    }
  }

  stepper.run();
}
