#pragma once
// ============================================================================
//  mock/recorder.h  --  the action log
// ----------------------------------------------------------------------------
//  Every mock function that would have moved hardware calls record() instead.
//  The result is a JSON file: an ordered list of what the autonomous routine
//  ASKED the robot to do, with every parameter that was in effect at the
//  moment of the call.
//
//  Deliberate scope limit: this file records intent. It does NOT compute where
//  the robot ends up. That is the viewer's job, because the starting pose is
//  chosen in the browser and must be changeable without recompiling.
//
//  JSON is written by hand rather than with a library, to keep the build to
//  exactly "run g++" with no dependencies to install.
// ============================================================================
#include <string>
#include <vector>

namespace sim {

// A tiny JSON object builder. Usage:
//   J().s("type","drive").n("distance_in", 17.7).b("reversed", true).str()
// produces {"type":"drive","distance_in":17.7,"reversed":true}
class J {
  std::string body;
  void comma();
public:
  J& s(const char* key, const std::string& value);  // string value
  J& n(const char* key, double value);              // number value
  J& b(const char* key, bool value);                // boolean value
  std::string str() const;
};

void record(const std::string& json_object);
void write_log(const std::string& path, const std::string& routine_name);

// Chassis geometry, captured from the Drive constructor so the viewer reads
// the real numbers out of main.cpp rather than having them retyped.
struct Geometry {
  double wheel_diameter = 0;
  double wheel_ratio    = 0;
  double gyro_scale     = 0;
  double robot_length_in = 15.0;   // measured estimate -- see README
  double robot_width_in  = 13.5;
  double track_width_in  = 12.0;   // wheel centre to wheel centre
};
extern Geometry geometry;

}  // namespace sim
