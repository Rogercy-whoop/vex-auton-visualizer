#pragma once
// ============================================================================
//  mock/vex.h  --  a stand-in for VEX Robotics' vex.h, for host-side simulation
// ----------------------------------------------------------------------------
//  The real vex.h pulls in v5.h and v5_vcs.h, which are proprietary and only
//  compile for the V5 brain's ARM processor. This file declares the SAME NAMES
//  so the same source compiles on a laptop. Nothing here touches hardware:
//  anything that would move something is recorded instead (recorder.h).
//
//  THE SEAM IS THREE FILES WIDE. A team's project is compiled exactly as
//  written, except that three files are swapped for stand-ins:
//
//      vex.h                      -> this file
//      auto-Template/drive.h      -> mock/auto-Template/drive.h
//      auto-Template/drive.cpp    -> mock/drive.cpp
//
//  Everything else -- autons.cpp, robot-config.cpp, main.cpp, the team's own
//  helpers, and the rest of the template (PID, odom, util) -- is the team's
//  real code, compiled unchanged. That is what lets another team use this by
//  filling in a robot profile rather than writing any code.
//
//  The API surface below covers what our school's template-based projects
//  use: motors, pneumatics, the inertial sensor, the controller, the brain's
//  screen, tasks and the competition object. Sensors that return readings the
//  path depends on (distance, optical) are deliberately NOT stubbed: a stub
//  would return a fake number and the simulation would be silently wrong.
// ============================================================================
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <source_location>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Where a call came from. It is used as a DEFAULT ARGUMENT, and C++ evaluates
// default arguments at the CALL SITE -- so inside the mock, `at` holds the file
// and line in autons.cpp that made the call, not a line in this file. That is
// the whole mechanism behind "click a move, see its line of code", and
// autons.cpp is still not edited: it calls with exactly the arguments it always
// did, and the extra one is filled in by the compiler.
using src_loc = std::source_location;

namespace vex {

// ---------------------------------------------------------------- enums ----
// The real SDK spreads these over many enum types; one per role is enough
// here. What matters is that the NAMES exist.
enum directionType { fwd, reverse, forward = fwd };
enum unitsType     { pct, percent = pct, volt, rpm, dps, deg, degrees = deg, rev, turns = rev };
enum timeUnits     { sec, seconds = sec, msec };
enum brakeType     { coast, brake, hold };
enum gearSetting   { ratio36_1, ratio18_1, ratio6_1 };
enum controllerType { primary, partner };
enum fontType {
  mono12, mono15, mono20, mono30, mono40, mono60, monoS, monoM, monoL, monoXL, monoXXL,
  prop20, prop30, prop40, prop60, propM, propL, propXL, propXXL
};
enum portType {
  PORT1 = 1, PORT2,  PORT3,  PORT4,  PORT5,  PORT6,  PORT7,  PORT8,
  PORT9,     PORT10, PORT11, PORT12, PORT13, PORT14, PORT15, PORT16,
  PORT17,    PORT18, PORT19, PORT20, PORT21, PORT22
};

struct color { unsigned rgb; };
inline constexpr color black{0x000000}, white{0xFFFFFF}, red{0xFF0000}, green{0x00FF00},
  blue{0x0000FF}, yellow{0xFFFF00}, orange{0xFFA500}, purple{0xFF00FF},
  cyan{0x00FFFF}, transparent{0};

// ------------------------------------------------------------ sim clock ----
// Simulated match time in ms. Every mock action that takes time on the robot
// advances it, which is why Tauto.time() prints a meaningful number.
double sim_now_ms();
void   sim_advance_ms(double ms);
void   sim_reset();

// Thrown when a routine runs far past any real match length. In simulation no
// sensor ever changes, so a waitUntil() on one -- or a while(true) with a wait
// inside -- would otherwise run forever. The harness catches this, keeps what
// was recorded up to that point, and flags the routine.
struct overrun { double at_ms; };
inline constexpr double SIM_LIMIT_MS = 180000;   // 3 min; skills is 60 s

// ------------------------------------------------------------- 3-wire ------
struct triport {
  struct port { };
  port A, B, C, D, E, F, G, H;
  port Port[8];
  triport(int = 0) {}
};

// ---------------------------------------------------------------- timer ----
// Reads the SIMULATED clock: Tauto.time() reports how long the routine would
// take on the field, not how long the laptop took to run it.
class timer {
  double start_ms = 0;
public:
  timer();
  void   clear();
  void   reset() { clear(); }
  double time();
  double time(timeUnits u);
  double value() { return time(sec); }
};

// ----------------------------------------------------- brain, controller ----
// Screen output has no effect on the path, so every method accepts anything
// and does nothing.
struct _screen {
  template <typename... A> void setCursor(A...) {}
  template <typename... A> void setFont(A...) {}
  template <typename... A> void setFillColor(A...) {}
  template <typename... A> void setPenColor(A...) {}
  template <typename... A> void setPenWidth(A...) {}
  template <typename... A> void print(A...) {}
  template <typename... A> void printAt(A...) {}
  template <typename... A> void drawRectangle(A...) {}
  template <typename... A> void drawCircle(A...) {}
  template <typename... A> void drawLine(A...) {}
  void clearScreen() {}
  void clearLine(int = 0) {}
  void newLine() {}
  void render() {}
  bool pressing() { return false; }
  int  xPosition() { return 0; }
  int  yPosition() { return 0; }
  template <typename F> void pressed(F) {}
};

struct _battery {
  template <typename... A> double capacity(A...) { return 100; }
  template <typename... A> double voltage(A...)  { return 12.8; }
  template <typename... A> double current(A...)  { return 0; }
};

class brain {
public:
  _screen  Screen;
  triport  ThreeWirePort;
  timer    Timer;
  _battery Battery;
};

class controller {
public:
  struct button {
    bool pressing() const { return false; }
    template <typename F> void pressed(F) {}
    template <typename F> void released(F) {}
  };
  struct axis {
    int  value() const { return 0; }
    template <typename... A> int position(A...) const { return 0; }
    template <typename F> void changed(F) {}
  };
  axis   Axis1, Axis2, Axis3, Axis4;
  button ButtonL1, ButtonL2, ButtonR1, ButtonR2;
  button ButtonA, ButtonB, ButtonX, ButtonY;
  button ButtonUp, ButtonDown, ButtonLeft, ButtonRight;
  _screen Screen;
  controller(controllerType = primary) {}
  void rumble(const char*) {}
};

// ---------------------------------------------------------------- motor ----
class motor {
public:
  const char* name = "motor";      // filled in from robot-config.cpp's symbol table
  int         port = 0;
  gearSetting gearing = ratio18_1;

  motor(int port = 0, gearSetting g = ratio18_1, bool reversed = false)
    : port(port), gearing(g) { (void)reversed; }
  motor(int port, bool reversed) : port(port) { (void)reversed; }

  void spin(directionType d, double value, unitsType u, src_loc at = src_loc::current());
  void spin(directionType d, src_loc at = src_loc::current());
  void stop(src_loc at = src_loc::current());
  void stop(brakeType b, src_loc at = src_loc::current());

  template <typename... A> bool spinFor(A...) { return true; }
  template <typename... A> bool spinToPosition(A...) { return true; }
  template <typename... A> double position(A...)    { return 0; }
  template <typename... A> double velocity(A...)    { return 0; }
  template <typename... A> double current(A...)     { return 0; }
  template <typename... A> double torque(A...)      { return 0; }
  template <typename... A> double temperature(A...) { return 25; }
  template <typename... A> void setPosition(A...) {}
  template <typename... A> void setVelocity(A...) {}
  template <typename... A> void setStopping(A...) {}
  template <typename... A> void setMaxTorque(A...) {}
  template <typename... A> void setTimeout(A...) {}
  void resetPosition() {}
  bool isSpinning() { return false; }

  // Free speed of the cartridge, rpm.
  double cartridge_rpm() const { return gearing == ratio6_1 ? 600 : gearing == ratio18_1 ? 200 : 100; }
};

// A motor_group only needs to answer one question for the simulation: which
// cartridge its motors use. It keeps a POINTER to its first motor and asks
// later, rather than copying the cartridge now -- the drive motors are defined
// in robot-config.cpp and the chassis in main.cpp, and C++ does not promise
// which file's globals are constructed first.
class motor_group {
public:
  const motor* first = nullptr;
  motor_group() {}
  // The first parameter is spelled out as a motor on purpose. A fully generic
  // `template <typename... M> motor_group(M&...)` would also match COPYING a
  // motor_group -- a better match than the copy constructor for a non-const
  // argument -- and silently take the group's address as if it were a motor.
  template <typename... M> motor_group(motor& m0, M&...) : first(&m0) {}
  template <typename... A> void spin(A...) {}
  template <typename... A> void stop(A...) {}
  template <typename... A> bool spinFor(A...) { return true; }
  template <typename... A> double position(A...) { return 0; }
  template <typename... A> double velocity(A...) { return 0; }
  template <typename... A> void setVelocity(A...) {}
  template <typename... A> void setStopping(A...) {}
  template <typename... A> void setPosition(A...) {}
  void resetPosition() {}
};

// --------------------------------------------------------------- sensors ---
class inertial {
public:
  inertial(int = 0) {}
  template <typename T> inertial(int, T) {}
  template <typename... A> double rotation(A...) { return 0; }
  template <typename... A> double heading(A...)  { return 0; }
  template <typename... A> double angle(A...)    { return 0; }
  template <typename... A> double pitch(A...)    { return 0; }
  template <typename... A> double roll(A...)     { return 0; }
  template <typename... A> double yaw(A...)      { return 0; }
  template <typename... A> void setRotation(A...) {}
  template <typename... A> void setHeading(A...) {}
  template <typename... A> void calibrate(A...) {}
  bool isCalibrating() { return false; }
  void resetRotation() {}
  void resetHeading() {}
  bool installed() { return true; }
};

class rotation {
public:
  rotation(int = 0, bool = false) {}
  template <typename... A> double position(A...) { return 0; }
  template <typename... A> double angle(A...)    { return 0; }
  template <typename... A> double velocity(A...) { return 0; }
  template <typename... A> void setPosition(A...) {}
  void resetPosition() {}
  void setReversed(bool) {}
};

class encoder {
public:
  encoder() {}
  encoder(triport::port&) {}
  template <typename... A> double position(A...) { return 0; }
  template <typename... A> double rotation(A...) { return 0; }
  template <typename... A> double velocity(A...) { return 0; }
  template <typename... A> void setPosition(A...) {}
  void resetRotation() {}
};

struct digital_in { digital_in(triport::port&) {} int value() { return 0; } };
struct limit      { limit(triport::port&) {} int pressing() { return 0; } int value() { return 0; } };
struct bumper     { bumper(triport::port&) {} int pressing() { return 0; } int value() { return 0; } };

// ------------------------------------------------------------ pneumatics ---
class digital_out {
public:
  const char* name = "solenoid";   // filled in from robot-config.cpp's symbol table
  bool state = false;
  digital_out() {}
  digital_out(triport::port&) {}
  void set(bool v, src_loc at = src_loc::current());
  void set(int  v, src_loc at = src_loc::current());
  int  value() const { return state ? 1 : 0; }
};

// The newer SDK wrapper around a solenoid. Recorded exactly like digital_out.
class pneumatics {
public:
  const char* name = "pneumatics";
  bool state = false;
  pneumatics(triport::port&) {}
  void open(src_loc at = src_loc::current());
  void close(src_loc at = src_loc::current());
  void set(bool v, src_loc at = src_loc::current());
  int  value() const { return state ? 1 : 0; }
};

// ---------------------------------------------------------------- vision ---
// Only referenced by name in VEXcode's generated robot-config.cpp.
struct vision {
  struct signature { template <typename... A> signature(A...) {} };
  struct code      { template <typename... A> code(A...) {} };
  template <typename... A> vision(A...) {}
};

// ------------------------------------------------------ tasks, competition --
// A task body never runs: main.cpp starts a display loop as a task, and that
// is an infinite loop. Creating the task object is harmless; running it would
// hang the simulator.
class task {
public:
  task() {}
  task(int (*)()) {}
  task(int (*)(void*), void*) {}
  static void sleep(std::uint32_t) {}
  void stop() {}
  void suspend() {}
  void resume() {}
};
class thread {
public:
  thread() {}
  thread(int (*)()) {}
  thread(void (*)()) {}
  thread(int (*)(void*), void*) {}
  void interrupt() {}
  void join() {}
};
namespace this_thread { inline void sleep_for(std::uint32_t) {} }

class competition {
public:
  void autonomous(void (*)()) {}
  void drivercontrol(void (*)()) {}
  bool isEnabled()          { return true; }
  bool isAutonomous()       { return true; }
  bool isDriverControl()    { return false; }
  bool isCompetitionSwitch(){ return false; }
  bool isFieldControl()     { return false; }
};

// -------------------------------------------------------- free functions ---
// wait() advances the simulated clock and is recorded: waiting consumes match
// time, so it belongs on the timeline.
void wait(double amount, timeUnits u, src_loc at = src_loc::current());

}  // namespace vex

// Filled in by the build from robot-config.cpp's symbol table: gives each
// device the name it was declared with, so the log can say "intake" rather
// than "a motor on port 8". Overloads for anything that records; everything
// else (the brain, the controller) is accepted and ignored.
void vexsim_name(vex::motor& d, const char* n);
void vexsim_name(vex::digital_out& d, const char* n);
void vexsim_name(vex::pneumatics& d, const char* n);
template <typename T> void vexsim_name(T&, const char*) {}

// Exactly the same includes, in the same order, as the real vex.h -- so the
// team's own headers are found and read as they would be on the brain.
// "robot-config.h" and "autons.h" are the TEAM's files (staged by the build);
// "auto-Template/drive.h" resolves to the mock, and the other template headers
// to the team's own copies.
#include "robot-config.h"
#include "auto-Template/odom.h"
#include "auto-Template/drive.h"
#include "auto-Template/util.h"
#include "auto-Template/PID.h"
#include "autons.h"

#define waitUntil(condition)                                                   \
  do {                                                                         \
    wait(5, msec);                                                             \
  } while (!(condition))

#define repeat(iterations)                                                     \
  for (int iterator = 0; iterator < iterations; iterator++)
