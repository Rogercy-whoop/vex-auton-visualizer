#include "recorder.h"
#include "vex.h"
#include <cstdio>
#include <sstream>

namespace sim {

Geometry geometry;
static std::vector<std::string> actions;

// JSON strings here are identifiers and file names, but escape the two
// characters that could break the output anyway.
static std::string esc(const std::string& s) {
  std::string o;
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
  return o;
}

void J::comma() { if (!body.empty()) body += ","; }

J& J::s(const char* key, const std::string& value) {
  comma();
  body += "\"" + std::string(key) + "\":\"" + esc(value) + "\"";
  return *this;
}

J& J::n(const char* key, double value) {
  comma();
  // %.6g: short and readable, and well inside float precision (~7 digits).
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

// "C:\...\src\autons.cpp" -> "autons.cpp". The viewer shows files by name.
static std::string base_name(const char* path) {
  std::string p(path);
  size_t k = p.find_last_of("/\\");
  return k == std::string::npos ? p : p.substr(k + 1);
}

void record(const std::string& json_object, const std::source_location& at) {
  J head;
  head.n("i", (double)actions.size())
      .n("t_ms", vex::sim_now_ms())
      .s("file", base_name(at.file_name()))
      .n("line", at.line());
  std::string merged = head.str();
  merged.pop_back();                        // drop the closing brace
  merged += "," + json_object.substr(1);    // splice on the body
  actions.push_back(merged);
}

std::string build_json(const std::string& routine_name, bool overran) {
  const double rpm = geometry.drive_motor ? geometry.drive_motor->cartridge_rpm() : 0;
  std::ostringstream out;
  out << "{\n";
  out << "  \"routine\": \"" << esc(routine_name) << "\",\n";
  out << "  \"duration_ms\": " << vex::sim_now_ms() << ",\n";
  out << "  \"overran\": " << (overran ? "true" : "false") << ",\n";
  out << "  \"geometry\": {"
      << "\"wheel_diameter_in\":" << geometry.wheel_diameter
      << ",\"wheel_ratio\":"      << geometry.wheel_ratio
      << ",\"gyro_scale\":"       << geometry.gyro_scale
      << ",\"cartridge_rpm\":"    << rpm
      << "},\n";
  out << "  \"actions\": [\n";
  for (size_t i = 0; i < actions.size(); ++i)
    out << "    " << actions[i] << (i + 1 < actions.size() ? "," : "") << "\n";
  out << "  ]\n}";
  return out.str();
}

void reset() {
  actions.clear();
  vex::sim_reset();
}

size_t action_count() { return actions.size(); }

}  // namespace sim
