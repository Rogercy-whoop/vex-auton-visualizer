// ============================================================================
//  mock/drive.cpp  --  the bodies the linker substitutes for the template's
// ----------------------------------------------------------------------------
//  Each motion function records the command plus EVERY parameter in force when
//  it was called. That matters: routines change exit conditions and timeouts
//  mid-routine, sometimes through set_drive_exit_conditions() and sometimes by
//  writing chassis.drive_timeout directly. A recorder that logged only the
//  explicit arguments would lose what is needed to simulate the move.
//
//  Every function also passes on `at`, the call site the compiler filled in,
//  so each log entry knows which line of the team's code produced it.
//
//  Nothing here reads a sensor back. The recorder runs the routine OPEN-LOOP:
//  get_absolute_heading() and friends return 0, so a routine that branches on a
//  sensor reading will always take the same branch here. The viewer's
//  simulation is where the robot's motion is actually worked out.
// ============================================================================
#include "vex.h"
#include "recorder.h"

using namespace vex;

Drive::Drive(enum ::drive_setup setup, motor_group L, motor_group R, int gyro_port,
             float wheel_diameter, float wheel_ratio, float gyro_scale,
             int LF, int RF, int LB, int RB, int ForwardTracker_port, float, float,
             int SidewaysTracker_port, float, float)
    : wheel_diameter(wheel_diameter), wheel_ratio(wheel_ratio), gyro_scale(gyro_scale),
      // identical to the template: inches travelled per motor degree
      drive_in_to_deg_ratio(wheel_ratio / 360.0 * M_PI * wheel_diameter),
      drive_setup(setup), DriveL(L), DriveR(R), Gyro(gyro_port),
      DriveLF(LF < 0 ? -LF : LF), DriveRF(RF < 0 ? -RF : RF),
      DriveLB(LB < 0 ? -LB : LB), DriveRB(RB < 0 ? -RB : RB),
      R_ForwardTracker(ForwardTracker_port), R_SidewaysTracker(SidewaysTracker_port) {
  // Hand the recorder what the CODE says about the chassis, so the viewer
  // never has to be told the wheel size or gearing separately.
  sim::geometry.wheel_diameter = wheel_diameter;
  sim::geometry.wheel_ratio    = wheel_ratio;
  sim::geometry.gyro_scale     = gyro_scale;
  sim::geometry.drive_motor    = L.first;
}

// ---------------------------------------------------------- configuration ---
// These only change state, but a change in gains mid-routine changes every
// later move, so they are recorded too -- and their line becomes clickable.
static void rec_constants(const char* loop, float mv, float kp, float ki, float kd, float si, const src_loc& at) {
  sim::record(sim::J().s("type", "config").s("loop", loop)
    .n("max_v", mv).n("kp", kp).n("ki", ki).n("kd", kd).n("starti", si).str(), at);
}
static void rec_exit(const char* loop, float se, float st, float to, const src_loc& at) {
  sim::record(sim::J().s("type", "exit").s("loop", loop)
    .n("settle_error", se).n("settle_time", st).n("timeout", to).str(), at);
}

void Drive::set_drive_constants(float mv, float kp, float ki, float kd, float si, src_loc at) {
  drive_max_voltage = mv; drive_kp = kp; drive_ki = ki; drive_kd = kd; drive_starti = si;
  rec_constants("drive", mv, kp, ki, kd, si, at);
}
void Drive::set_heading_constants(float mv, float kp, float ki, float kd, float si, src_loc at) {
  heading_max_voltage = mv; heading_kp = kp; heading_ki = ki; heading_kd = kd; heading_starti = si;
  rec_constants("heading", mv, kp, ki, kd, si, at);
}
void Drive::set_turn_constants(float mv, float kp, float ki, float kd, float si, src_loc at) {
  turn_max_voltage = mv; turn_kp = kp; turn_ki = ki; turn_kd = kd; turn_starti = si;
  rec_constants("turn", mv, kp, ki, kd, si, at);
}
void Drive::set_swing_constants(float mv, float kp, float ki, float kd, float si, src_loc at) {
  swing_max_voltage = mv; swing_kp = kp; swing_ki = ki; swing_kd = kd; swing_starti = si;
  rec_constants("swing", mv, kp, ki, kd, si, at);
}

void Drive::set_drive_exit_conditions(float se, float st, float to, src_loc at) {
  drive_settle_error = se; drive_settle_time = st; drive_timeout = to;
  rec_exit("drive", se, st, to, at);
}
void Drive::set_turn_exit_conditions(float se, float st, float to, src_loc at) {
  turn_settle_error = se; turn_settle_time = st; turn_timeout = to;
  rec_exit("turn", se, st, to, at);
}
void Drive::set_swing_exit_conditions(float se, float st, float to, src_loc at) {
  swing_settle_error = se; swing_settle_time = st; swing_timeout = to;
  rec_exit("swing", se, st, to, at);
}

// ---------------------------------------------------------------- motion ----
// The short overloads forward to the full one exactly as the template does,
// filling in stored member values -- so defaults resolve the same way they do
// on the robot. Each passes `at` along, so the line recorded is the caller's.

void Drive::drive_distance(float d, src_loc at) {
  drive_distance(d, desired_heading, drive_max_voltage, heading_max_voltage,
                 drive_settle_error, drive_settle_time, drive_timeout, at);
}
void Drive::drive_distance(float d, float h, src_loc at) {
  drive_distance(d, h, drive_max_voltage, heading_max_voltage,
                 drive_settle_error, drive_settle_time, drive_timeout, at);
}
void Drive::drive_distance(float d, float h, float dv, float hv, src_loc at) {
  drive_distance(d, h, dv, hv, drive_settle_error, drive_settle_time, drive_timeout, at);
}
void Drive::drive_distance(float d, float h, float dv, float hv, float se, float st, float to, src_loc at) {
  drive_distance(d, h, dv, hv, se, st, to, drive_kp, drive_ki, drive_kd, drive_starti,
                 heading_kp, heading_ki, heading_kd, heading_starti, at);
}
void Drive::drive_distance(float d, float h, float dv, float hv, float se, float st, float to,
                           float dkp, float dki, float dkd, float dsi,
                           float hkp, float hki, float hkd, float hsi, src_loc at) {
  desired_heading = h;
  sim::record(sim::J().s("type", "drive")
    .n("distance_in", d).n("heading_deg", h)
    .n("drive_max_v", dv).n("heading_max_v", hv)
    .n("settle_error", se).n("settle_time", st).n("timeout", to)
    .n("drive_kp", dkp).n("drive_ki", dki).n("drive_kd", dkd).n("drive_starti", dsi)
    .n("heading_kp", hkp).n("heading_ki", hki).n("heading_kd", hkd).n("heading_starti", hsi)
    .str(), at);
  // With settle_error = 0 the settle branch of PID::is_settled() cannot fire,
  // so the timeout is the move's exact duration. With any other value it is an
  // upper bound; the viewer's simulation works out the real figure.
  vex::sim_advance_ms(to);
}

void Drive::turn_to_angle(float a, src_loc at) { turn_to_angle(a, turn_max_voltage, at); }
void Drive::turn_to_angle(float a, float mv, src_loc at) {
  turn_to_angle(a, mv, turn_settle_error, turn_settle_time, turn_timeout, at);
}
void Drive::turn_to_angle(float a, float mv, float se, float st, float to, src_loc at) {
  turn_to_angle(a, mv, se, st, to, turn_kp, turn_ki, turn_kd, turn_starti, at);
}
void Drive::turn_to_angle(float a, float mv, float se, float st, float to,
                          float kp, float ki, float kd, float si, src_loc at) {
  desired_heading = a;
  sim::record(sim::J().s("type", "turn")
    .n("heading_deg", a).n("turn_max_v", mv)
    .n("settle_error", se).n("settle_time", st).n("timeout", to)
    .n("turn_kp", kp).n("turn_ki", ki).n("turn_kd", kd).n("turn_starti", si)
    .str(), at);
  // Turns genuinely settle, so the timeout is only an upper bound here.
  vex::sim_advance_ms(to);
}

// Swings. Transcribed with one quirk intact: the template clamps a swing's
// output with turn_max_voltage -- the MEMBER set by set_turn_constants() --
// and never uses its own swing_max_voltage parameter. Both are recorded so the
// simulation can reproduce what the robot actually does.
static void rec_swing(const char* side, float a, float swing_mv, float clamp_v, float se, float st,
                      float to, float kp, float ki, float kd, float si, const src_loc& at) {
  sim::record(sim::J().s("type", "swing").s("side", side).n("heading_deg", a)
    .n("swing_max_v", swing_mv).n("clamp_v", clamp_v)
    .n("settle_error", se).n("settle_time", st).n("timeout", to)
    .n("swing_kp", kp).n("swing_ki", ki).n("swing_kd", kd).n("swing_starti", si).str(), at);
  vex::sim_advance_ms(to);
}
void Drive::left_swing_to_angle(float a, src_loc at) {
  left_swing_to_angle(a, swing_max_voltage, swing_settle_error, swing_settle_time, swing_timeout,
                      swing_kp, swing_ki, swing_kd, swing_starti, at);
}
void Drive::left_swing_to_angle(float a, float mv, float se, float st, float to,
                                float kp, float ki, float kd, float si, src_loc at) {
  desired_heading = a;
  rec_swing("left", a, mv, turn_max_voltage, se, st, to, kp, ki, kd, si, at);
}
void Drive::right_swing_to_angle(float a, src_loc at) {
  right_swing_to_angle(a, swing_max_voltage, swing_settle_error, swing_settle_time, swing_timeout,
                       swing_kp, swing_ki, swing_kd, swing_starti, at);
}
void Drive::right_swing_to_angle(float a, float mv, float se, float st, float to,
                                 float kp, float ki, float kd, float si, src_loc at) {
  desired_heading = a;
  rec_swing("right", a, mv, turn_max_voltage, se, st, to, kp, ki, kd, si, at);
}

// Open-loop voltage: the drive keeps pushing at this voltage until the next
// command, so the viewer applies it through any wait() that follows.
void Drive::drive_with_voltage(float l, float r, src_loc at) {
  sim::record(sim::J().s("type", "voltage").n("left_v", l).n("right_v", r).str(), at);
}

// ------------------------------------------------------ heading & odometry ---
// set_heading() re-zeroes the gyro, which shifts the frame every later
// heading is measured in. The viewer needs to know, so it is recorded.
void Drive::set_heading(float orientation_deg, src_loc at) {
  desired_heading = orientation_deg;
  sim::record(sim::J().s("type", "set_heading").n("heading_deg", orientation_deg).str(), at);
}
void Drive::set_coordinates(float x, float y, float orientation_deg, src_loc at) {
  desired_heading = orientation_deg;
  sim::record(sim::J().s("type", "set_coordinates")
    .n("x", x).n("y", y).n("heading_deg", orientation_deg).str(), at);
}

// Point-to-point moves depend on odometry, which is not simulated yet. They
// are recorded so the viewer can say exactly where a routine used one.
static void rec_point(const char* type, float x, float y, float to, const src_loc& at) {
  sim::record(sim::J().s("type", type).n("x", x).n("y", y).n("timeout", to).b("simulated", false).str(), at);
  vex::sim_advance_ms(to);
}
void Drive::drive_to_point(float X, float Y, src_loc at) { rec_point("drive_to_point", X, Y, drive_timeout, at); }
void Drive::drive_to_point(float X, float Y, float, float, src_loc at) { rec_point("drive_to_point", X, Y, drive_timeout, at); }
void Drive::drive_to_point(float X, float Y, float, float, float, float, float to, src_loc at) { rec_point("drive_to_point", X, Y, to, at); }
void Drive::drive_to_point(float X, float Y, float, float, float, float, float to,
                           float, float, float, float, float, float, float, float, src_loc at) { rec_point("drive_to_point", X, Y, to, at); }
void Drive::turn_to_point(float X, float Y, src_loc at) { rec_point("turn_to_point", X, Y, turn_timeout, at); }
void Drive::turn_to_point(float X, float Y, float, src_loc at) { rec_point("turn_to_point", X, Y, turn_timeout, at); }
void Drive::turn_to_point(float X, float Y, float, float, float, float, float to, src_loc at) { rec_point("turn_to_point", X, Y, to, at); }
void Drive::turn_to_point(float X, float Y, float, float, float, float, float to,
                          float, float, float, float, src_loc at) { rec_point("turn_to_point", X, Y, to, at); }

// No sensor ever changes in the recorder (see the note at the top).
float Drive::get_absolute_heading()        { return 0; }
float Drive::get_left_position_in()        { return 0; }
float Drive::get_right_position_in()       { return 0; }
float Drive::get_X_position()              { return 0; }
float Drive::get_Y_position()              { return 0; }
float Drive::get_ForwardTracker_position() { return 0; }
float Drive::get_SidewaysTracker_position(){ return 0; }
void  Drive::position_track()              {}
int   Drive::position_track_task()         { return 0; }

// Driver control never runs in simulation. Weak, so a team's own definition
// (ours lives in user.cpp) takes precedence when there is one.
__attribute__((weak)) void Drive::control_arcade()    {}
__attribute__((weak)) void Drive::control_tank()      {}
__attribute__((weak)) void Drive::control_holonomic() {}
