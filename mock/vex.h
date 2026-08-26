#pragma once
// ============================================================================
//  mock/vex.h  --  a fake VEX V5 API for host-side simulation
// ----------------------------------------------------------------------------
//  This file replaces VEX Robotics' vex.h. The real one pulls in v5.h and
//  v5_vcs.h, which are proprietary and compile only for the V5 brain's ARM
//  processor. This one declares the SAME NAMES with empty bodies, so the same
//  source code compiles on a laptop.
//
//  Nothing here talks to hardware. Anything that would move a motor instead
//  appends a record to the action log (see recorder.h).
//
//  Author: Rogerchenyu (117V). Not part of the VEX SDK.
// ============================================================================
#include <cmath>
#include <cstdio>
#include <string>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace vex {

// ---------------------------------------------------------------- enums ----
// The real SDK spreads these across several enum types (directionType,
// percentUnits, voltageUnits, ...). Collapsing the unit ones into a single
// enum keeps the mock small; the only thing that matters is that the NAMES
// exist and that calls like spin(fwd, 10, pct) still compile.
enum directionType { fwd, reverse, forward = fwd };
enum unitsType     { pct, volt, rpm, deg, rev };
enum timeUnits     { sec, msec };
enum brakeType     { coast, brake, hold };
enum gearSetting   { ratio36_1, ratio18_1, ratio6_1 };

enum portType {
  PORT1 = 1, PORT2,  PORT3,  PORT4,  PORT5,  PORT6,  PORT7,  PORT8,
  PORT9,     PORT10, PORT11, PORT12, PORT13, PORT14, PORT15, PORT16,
  PORT17,    PORT18, PORT19, PORT20, PORT21, PORT22
};

// ------------------------------------------------------------ sim clock ----
// The simulated match clock, in milliseconds. Every mock action that would
// take real time on the robot advances it. This is what makes Tauto.time()
// print a meaningful number instead of zero.
double sim_now_ms();
void   sim_advance_ms(double ms);

// --------------------------------------------------------------- motor -----
class motor {
public:
  std::string name;
  // The trailing `name` parameter is an addition, defaulted so that calls
  // written against the real SDK signature still compile unchanged.
  motor(int port = 0, gearSetting g = ratio18_1, bool reversed = false,
        const char* nm = "motor");
  void   spin(directionType d, double value, unitsType u);
  void   spin(directionType d);
  void   stop();
  void   stop(brakeType b);
  double position(unitsType u);
  void   resetPosition();
  void   setVelocity(double, unitsType) {}
};

// --------------------------------------------------------- motor_group -----
class motor_group {
public:
  // Variadic so motor_group(leftA, leftB, leftC) works with any count,
  // exactly as the real SDK allows 1..10 motors.
  motor_group() {}
  template <typename... M> motor_group(M&... /*motors*/) {}
  void   spin(directionType, double, unitsType) {}
  void   stop() {}
  void   stop(brakeType) {}
  double position(unitsType) { return 0; }
  void   resetPosition() {}
};

// ------------------------------------------------------------ inertial -----
class inertial {
public:
  inertial(int port = 0) {}
  double rotation()      { return 0; }
  double rotation(unitsType) { return 0; }
  double heading()       { return 0; }
  void   calibrate()     {}
  bool   isCalibrating() { return false; }
  void   setRotation(double, unitsType) {}
};

// --------------------------------------------------------- digital_out -----
class digital_out {
public:
  std::string name;
  bool state = false;
  digital_out(const char* nm = "solenoid");
  void set(bool  v);
  void set(int   v);   // main.cpp calls descore.set(0)
};

// -------------------------------------------------------------- timer ------
// Reads the SIMULATED clock, not the wall clock. Tauto.time() therefore
// reports how long the routine would take on the field, not how long g++
// took to run it.
class timer {
  double start_ms = 0;
public:
  timer();
  void   clear();
  double time();
  double time(timeUnits u);
};

// --------------------------------------------------- brain / controller ----
// Declared only because robot-config.h references them. Screen output is a
// no-op: printing to a brain screen has no effect on the path.
struct _screen {
  void setCursor(int, int) {}
  void setFont(int) {}
  void setFillColor(int) {}
  void clearScreen() {}
  bool pressing() { return false; }
  template <typename... A> void print(const char*, A...) {}
  template <typename... A> void printAt(int, int, const char*, A...) {}
};
class brain      { public: _screen Screen; };
class controller { public: controller(int = 0) {} _screen Screen; };

// ------------------------------------------------------- free functions ----
// wait() advances the simulated clock and is recorded, because waiting
// consumes match time and therefore matters to the timeline.
void wait(double amount, timeUnits u);

}  // namespace vex

// The real vex.h ends by pulling in the project's own headers. Mirrored here
// so that #include "vex.h" from autons.cpp brings in everything it expects.
#include "robot-config.h"
#include "util.h"
#include "drive.h"
#include "autons.h"
