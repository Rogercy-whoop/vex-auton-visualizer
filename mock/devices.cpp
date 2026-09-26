// ============================================================================
//  mock/devices.cpp  --  what the fake devices do, and the simulated clock
// ----------------------------------------------------------------------------
//  The devices themselves are NOT defined here. They come from the team's own
//  robot-config.cpp, compiled unchanged: `motor intake = motor(PORT8, ...)`
//  constructs a mock motor, because vex.h is the mock.
//
//  That leaves one problem. A motor built from robot-config.cpp knows its port
//  but not its name, and the log needs to say "intake", not "a motor on port
//  8". The build reads the names out of robot-config's SYMBOL TABLE -- the list
//  of globals the compiler emitted -- and generates a call to vexsim_name() for
//  each one. No source code is read to find them.
// ============================================================================
#include "vex.h"
#include "recorder.h"

namespace vex {

// ------------------------------------------------------------ sim clock ----
static double clock_ms = 0;
double sim_now_ms() { return clock_ms; }
void   sim_reset()  { clock_ms = 0; }
void   sim_advance_ms(double m) {
  clock_ms += m;
  if (clock_ms > SIM_LIMIT_MS) throw overrun{ clock_ms };
}

// ---------------------------------------------------------------- motor -----
static const char* dir_name(directionType d) { return d == reverse ? "reverse" : "fwd"; }
static const char* unit_name(unitsType u)    { return u == volt ? "volt" : u == rpm ? "rpm" : "pct"; }

void motor::spin(directionType d, double value, unitsType u, src_loc at) {
  // A negative speed spins the other way; normalise so the log says which.
  directionType eff = value < 0 ? (d == reverse ? fwd : reverse) : d;
  sim::record(sim::J().s("type", "motor").s("name", name).s("action", "spin")
    .s("dir", dir_name(eff)).n("value", value < 0 ? -value : value).s("units", unit_name(u)).str(), at);
}
void motor::spin(directionType d, src_loc at) { spin(d, 100, pct, at); }

void motor::stop(src_loc at) {
  sim::record(sim::J().s("type", "motor").s("name", name).s("action", "stop").str(), at);
}
void motor::stop(brakeType b, src_loc at) {
  const char* m = b == brake ? "brake" : b == hold ? "hold" : "coast";
  sim::record(sim::J().s("type", "motor").s("name", name).s("action", "stop").s("mode", m).str(), at);
}

// ---------------------------------------------------------- pneumatics ------
void digital_out::set(bool v, src_loc at) {
  state = v;
  sim::record(sim::J().s("type", "pneumatic").s("name", name).b("state", v).str(), at);
}
void digital_out::set(int v, src_loc at) { set(v != 0, at); }

void pneumatics::set(bool v, src_loc at) {
  state = v;
  sim::record(sim::J().s("type", "pneumatic").s("name", name).b("state", v).str(), at);
}
void pneumatics::open(src_loc at)  { set(true, at); }
void pneumatics::close(src_loc at) { set(false, at); }

// -------------------------------------------------------------- timer ------
timer::timer()        { start_ms = sim_now_ms(); }
void   timer::clear() { start_ms = sim_now_ms(); }
double timer::time()  { return sim_now_ms() - start_ms; }
double timer::time(timeUnits u) {
  double ms = time();
  return u == sec ? ms / 1000.0 : ms;
}

// --------------------------------------------------------------- wait ------
void wait(double amount, timeUnits u, src_loc at) {
  double ms = u == sec ? amount * 1000.0 : amount;
  sim::record(sim::J().s("type", "wait").n("ms", ms).str(), at);
  sim_advance_ms(ms);
}

}  // namespace vex

// ------------------------------------------------------------- naming ------
void vexsim_name(vex::motor& d, const char* n)       { d.name = n; }
void vexsim_name(vex::digital_out& d, const char* n) { d.name = n; }
void vexsim_name(vex::pneumatics& d, const char* n)  { d.name = n; }
