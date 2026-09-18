#include "recorder.h"
#include "vex.h"
#include <cstdio>
#include <fstream>
#include <sstream>

namespace sim {

Geometry geometry;
static std::vector<std::string> actions;

void J::comma() { if (!body.empty()) body += ","; }

J& J::s(const char* key, const std::string& value) {
  comma();
  body += "\"" + std::string(key) + "\":\"" + value + "\"";
  return *this;
}

J& J::n(const char* key, double value) {
  comma();
  // %.6g keeps numbers short and human-readable in the log while staying
  // well inside float precision (a float carries ~7 significant digits).
  char buf[64];
  std::snprintf(buf, sizeof buf, "%.6g", value);
  body += "\"" + std::string(key) + "\":" + buf;
  return *this;
}

J& J::b(const char* key, bool value) {
  comma();
  body += "\"" + std::string(key) + "\":" + (value ? "true" : "false");
  return *this;
}

std::string J::str() const { return "{" + body + "}"; }

void record(const std::string& json_object) {
  // Every action carries its index and the simulated time at which it began,
  // so the viewer can build a timeline without re-deriving the ordering.
  J head;
  head.n("i", (double)actions.size()).n("t_ms", vex::sim_now_ms());
  std::string merged = head.str();
  merged.pop_back();                        // drop the closing brace
  merged += "," + json_object.substr(1);    // splice on the body
  actions.push_back(merged);
}

std::string build_json(const std::string& routine_name) {
  std::ostringstream out;
  out << "{\n";
  out << "  \"routine\": \"" << routine_name << "\",\n";
  out << "  \"duration_ms\": " << vex::sim_now_ms() << ",\n";
  out << "  \"geometry\": {"
      << "\"wheel_diameter_in\":"  << geometry.wheel_diameter
      << ",\"wheel_ratio\":"       << geometry.wheel_ratio
      << ",\"gyro_scale\":"        << geometry.gyro_scale
      << "},\n";
  out << "  \"actions\": [\n";
  for (size_t i = 0; i < actions.size(); ++i) {
    out << "    " << actions[i] << (i + 1 < actions.size() ? "," : "") << "\n";
  }
  out << "  ]\n}";
  return out.str();
}

// Running several routines in one process needs the log and the clock wiped
// between them, or routine two would inherit routine one's timeline.
void reset() {
  actions.clear();
  vex::sim_reset();
}

size_t action_count() { return actions.size(); }

void write_log(const std::string& path, const std::string& routine_name) {
  std::ofstream out(path.c_str());
  if (!out) {
    std::fprintf(stderr, "ERROR: cannot open %s for writing\n", path.c_str());
    return;
  }
  out << build_json(routine_name) << "\n";
}

}  // namespace sim
