// ============================================================================
//  mock/devices.cpp  --  fake hardware objects + the simulated clock
// ----------------------------------------------------------------------------
//  This replaces robot-config.cpp. The device list mirrors the real one, minus
//  the port numbers, which are meaningless off the brain. Each device carries a
//  NAME instead, because the log needs to say "matchload opened", not
//  "three-wire port B went high".
// ============================================================================
#include "vex.h"
#include "recorder.h"

namespace vex {

// ------------------------------------------------------------ sim clock ----
static double clock_ms = 0;
double sim_now_ms()             { return clock_ms; }
void   sim_advance_ms(double m) { clock_ms += m; }
void   sim_reset()              { clock_ms = 0; }

// ---------------------------------------------------------------- motor -----
motor::motor(int, gearSetting, bool, const char* nm) : name(nm) {}

void motor::spin(directionType d, double value, unitsType u) {
  const char* dir = (d == reverse) ? "reverse" : "fwd";
  const char* un  = (u == volt) ? "volt" : (u == rpm ? "rpm" : "pct");
  sim::record(sim::J().s("type","motor").s("name",name).s("action","spin")
    .s("dir",dir).n("value",value).s("units",un).str());
}
void motor::spin(directionType d) { spin(d, 100, pct); }

void motor::stop() {
  sim::record(sim::J().s("type","motor").s("name",name).s("action","stop").str());
}
void motor::stop(brakeType b) {
  const char* m = (b == brake) ? "brake" : (b == hold ? "hold" : "coast");
  sim::record(sim::J().s("type","motor").s("name",name).s("action","stop")
    .s("mode",m).str());
}
double motor::position(unitsType) { return 0; }
void   motor::resetPosition()     {}

// ---------------------------------------------------------- digital_out -----
digital_out::digital_out(const char* nm) : name(nm) {}
void digital_out::set(bool v) {
  state = v;
  sim::record(sim::J().s("type","pneumatic").s("name",name).b("state",v).str());
}
void digital_out::set(int v) { set(v != 0); }

// -------------------------------------------------------------- timer ------
timer::timer()            { start_ms = sim_now_ms(); }
void   timer::clear()     { start_ms = sim_now_ms(); }
double timer::time()      { return sim_now_ms() - start_ms; }
double timer::time(timeUnits u) {
  double ms = time();
  return (u == sec) ? ms / 1000.0 : ms;
}

// --------------------------------------------------------------- wait ------
void wait(double amount, timeUnits u) {
  double ms = (u == sec) ? amount * 1000.0 : amount;
  sim::record(sim::J().s("type","wait").n("ms",ms).str());
  sim_advance_ms(ms);
}

}  // namespace vex

// ------------------------------------------------- the device list itself ---
// Same identifiers as robot-config.cpp, so autons.cpp and autofunction.cpp
// resolve against these instead.
brain      Brain;
controller Controller1;

motor leftA (0, ratio6_1, true,  "leftA");
motor leftB (0, ratio6_1, true,  "leftB");
motor leftC (0, ratio6_1, true,  "leftC");
motor rightA(0, ratio6_1, false, "rightA");
motor rightB(0, ratio6_1, false, "rightB");
motor rightC(0, ratio6_1, false, "rightC");

motor intake (0, ratio6_1, true, "intake");
motor shooter(0, ratio6_1, true, "shooter");

digital_out midbar   ("midbar");
digital_out matchload("matchload");
digital_out descore  ("descore");

inertial Gyro(0);

void vexcodeInit(void) {}
