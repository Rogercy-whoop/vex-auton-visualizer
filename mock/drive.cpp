// ============================================================================
//  mock/drive.cpp  --  the bodies the linker substitutes for the template's
// ----------------------------------------------------------------------------
//  Each motion function records the command plus EVERY parameter that was in
//  effect when it was called. That last part matters: autons.cpp changes the
//  exit conditions and timeouts repeatedly mid-routine, sometimes via
//  set_drive_exit_conditions() and sometimes by assigning drive_timeout
//  directly. A recorder that only logged the four explicit arguments would
//  lose the context needed to simulate the move.
// ============================================================================
#include "vex.h"
#include "recorder.h"

Drive::Drive(enum ::drive_setup /*drive_setup*/, motor_group /*DriveL*/,
             motor_group /*DriveR*/, int /*gyro_port*/, float wheel_diameter,
             float wheel_ratio, float gyro_scale, int, int, int, int, int,
             float, float, int, float, float)
    : wheel_diameter(wheel_diameter), wheel_ratio(wheel_ratio),
      gyro_scale(gyro_scale),
      // Identical to the template: inches travelled per motor degree.
      drive_in_to_deg_ratio(wheel_ratio / 360.0 * M_PI * wheel_diameter) {
  // Hand the real geometry to the recorder so the viewer never has to be
  // told the wheel size separately.
  sim::geometry.wheel_diameter = wheel_diameter;
  sim::geometry.wheel_ratio    = wheel_ratio;
  sim::geometry.gyro_scale     = gyro_scale;
}

// ---------------------------------------------------------- configuration ---
// These only mutate state; they are still recorded, because a change in gains
// mid-routine changes how every later move behaves.
void Drive::set_drive_constants(float mv, float kp, float ki, float kd, float si) {
  drive_max_voltage = mv; drive_kp = kp; drive_ki = ki; drive_kd = kd; drive_starti = si;
  sim::record(sim::J().s("type","config").s("loop","drive")
    .n("max_v",mv).n("kp",kp).n("ki",ki).n("kd",kd).n("starti",si).str());
}
void Drive::set_heading_constants(float mv, float kp, float ki, float kd, float si) {
  heading_max_voltage = mv; heading_kp = kp; heading_ki = ki; heading_kd = kd; heading_starti = si;
  sim::record(sim::J().s("type","config").s("loop","heading")
    .n("max_v",mv).n("kp",kp).n("ki",ki).n("kd",kd).n("starti",si).str());
}
void Drive::set_turn_constants(float mv, float kp, float ki, float kd, float si) {
  turn_max_voltage = mv; turn_kp = kp; turn_ki = ki; turn_kd = kd; turn_starti = si;
  sim::record(sim::J().s("type","config").s("loop","turn")
    .n("max_v",mv).n("kp",kp).n("ki",ki).n("kd",kd).n("starti",si).str());
}
void Drive::set_swing_constants(float mv, float kp, float ki, float kd, float si) {
  swing_max_voltage = mv; swing_kp = kp; swing_ki = ki; swing_kd = kd; swing_starti = si;
  sim::record(sim::J().s("type","config").s("loop","swing")
    .n("max_v",mv).n("kp",kp).n("ki",ki).n("kd",kd).n("starti",si).str());
}

void Drive::set_drive_exit_conditions(float se, float st, float to) {
  drive_settle_error = se; drive_settle_time = st; drive_timeout = to;
  sim::record(sim::J().s("type","exit").s("loop","drive")
    .n("settle_error",se).n("settle_time",st).n("timeout",to).str());
}
void Drive::set_turn_exit_conditions(float se, float st, float to) {
  turn_settle_error = se; turn_settle_time = st; turn_timeout = to;
  sim::record(sim::J().s("type","exit").s("loop","turn")
    .n("settle_error",se).n("settle_time",st).n("timeout",to).str());
}
void Drive::set_swing_exit_conditions(float se, float st, float to) {
  swing_settle_error = se; swing_settle_time = st; swing_timeout = to;
  sim::record(sim::J().s("type","exit").s("loop","swing")
    .n("settle_error",se).n("settle_time",st).n("timeout",to).str());
}

// ---------------------------------------------------------------- motion ----
// The short overloads forward to the full one exactly as the template does,
// filling in the stored member values. Keeping that structure means the mock
// resolves defaults the same way the robot does.
void Drive::drive_distance(float d) {
  drive_distance(d, desired_heading, drive_max_voltage, heading_max_voltage,
                 drive_settle_error, drive_settle_time, drive_timeout);
}
void Drive::drive_distance(float d, float h) {
  drive_distance(d, h, drive_max_voltage, heading_max_voltage,
                 drive_settle_error, drive_settle_time, drive_timeout);
}
void Drive::drive_distance(float d, float h, float dv, float hv) {
  drive_distance(d, h, dv, hv, drive_settle_error, drive_settle_time, drive_timeout);
}

void Drive::drive_distance(float d, float h, float dv, float hv,
                           float se, float st, float to) {
  desired_heading = h;
  sim::record(sim::J().s("type","drive")
    .n("distance_in",d).n("heading_deg",h)
    .n("drive_max_v",dv).n("heading_max_v",hv)
    .n("settle_error",se).n("settle_time",st).n("timeout",to)
    .n("drive_kp",drive_kp).n("drive_ki",drive_ki).n("drive_kd",drive_kd).n("drive_starti",drive_starti)
    .n("heading_kp",heading_kp).n("heading_ki",heading_ki).n("heading_kd",heading_kd).n("heading_starti",heading_starti)
    .str());
  // With settle_error = 0 the settle branch of PID::is_settled() can never
  // fire, so the move always runs its full timeout. That makes the timeout an
  // exact duration here, not an estimate. See README "The timeout finding".
  vex::sim_advance_ms(to);
}

void Drive::turn_to_angle(float a) { turn_to_angle(a, turn_max_voltage); }
void Drive::turn_to_angle(float a, float mv) {
  turn_to_angle(a, mv, turn_settle_error, turn_settle_time, turn_timeout);
}
void Drive::turn_to_angle(float a, float mv, float se, float st, float to) {
  desired_heading = a;
  sim::record(sim::J().s("type","turn")
    .n("heading_deg",a).n("turn_max_v",mv)
    .n("settle_error",se).n("settle_time",st).n("timeout",to)
    .n("turn_kp",turn_kp).n("turn_ki",turn_ki).n("turn_kd",turn_kd).n("turn_starti",turn_starti)
    .str());
  // Turns have settle_error = 1, so they genuinely converge and usually exit
  // well before the timeout. Advancing by the full timeout is therefore an
  // UPPER BOUND on turn duration, not the true value. The PID simulation in
  // the viewer replaces this with a real number.
  vex::sim_advance_ms(to);
}

// Swings are declared for interface completeness. autons.cpp never calls them;
// if it ever does, they will show up in the log rather than silently vanish.
void Drive::left_swing_to_angle(float a) {
  sim::record(sim::J().s("type","swing").s("side","left").n("heading_deg",a)
    .n("timeout",swing_timeout).str());
  vex::sim_advance_ms(swing_timeout);
}
void Drive::right_swing_to_angle(float a) {
  sim::record(sim::J().s("type","swing").s("side","right").n("heading_deg",a)
    .n("timeout",swing_timeout).str());
  vex::sim_advance_ms(swing_timeout);
}

void Drive::drive_with_voltage(float l, float r) {
  sim::record(sim::J().s("type","voltage").n("left_v",l).n("right_v",r).str());
}

// Odometry is dead on this robot: ZERO_TRACKER_ODOM is configured but
// set_coordinates() is never called, so position_track_task() never starts and
// X/Y stay at zero forever. The mock reproduces that faithfully.
float Drive::get_absolute_heading() { return 0; }
float Drive::get_X_position()       { return 0; }
float Drive::get_Y_position()       { return 0; }
