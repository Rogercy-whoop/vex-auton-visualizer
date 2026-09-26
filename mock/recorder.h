#pragma once
// ============================================================================
//  mock/recorder.h  --  the action log
// ----------------------------------------------------------------------------
//  Every mock function that would have moved hardware calls record() instead.
//  The result is an ordered list of what the routine ASKED the robot to do,
//  each entry carrying every parameter in force at that moment and the file
//  and line of the call that made it.
//
//  Deliberate scope limit: this file records intent. It does NOT work out
//  where the robot ends up. That is the viewer's job, because the start pose
//  is chosen in the browser and must be changeable without recompiling.
//
//  JSON is written by hand rather than with a library, so the build stays
//  "run g++" with nothing else to install.
// ============================================================================
#include <source_location>
#include <string>
#include <vector>

namespace vex { class motor; }

namespace sim {

// A tiny JSON object builder:
//   J().s("type","drive").n("distance_in", 17.7).str()
//   -> {"type":"drive","distance_in":17.7}
class J {
  std::string body;
  void comma();
public:
  J& s(const char* key, const std::string& value);  // string
  J& n(const char* key, double value);              // number
  J& b(const char* key, bool value);                // boolean
  std::string str() const;
};

// Appends one action, stamped with its index, the simulated time, and the
// file and line that made the call.
void record(const std::string& json_object, const std::source_location& at);

// What the code itself says about the chassis, captured by the Drive
// constructor in the team's main.cpp. The drive motor is kept as a pointer and
// read only when the log is written, by which time every global exists.
struct Geometry {
  double wheel_diameter = 0;
  double wheel_ratio    = 0;
  double gyro_scale     = 0;
  const vex::motor* drive_motor = nullptr;
};
extern Geometry geometry;

std::string build_json(const std::string& routine_name, bool overran);
void        reset();          // wipe the log and the clock between routines
size_t      action_count();

}  // namespace sim
