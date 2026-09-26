#pragma once
// ============================================================================
//  mock/auto-Template/drive.h  --  THE SEAM
// ----------------------------------------------------------------------------
//  Stands in for the template's auto-Template/drive.h. It sits at the same
//  relative path so that `#include "auto-Template/drive.h"` -- in the team's own
//  autons.h -- finds this file instead of the real one.
//
//  Every public member of the real Drive class is here, with the same name and
//  type, so any team's code that touches the chassis compiles unchanged: user
//  code reaches into chassis.DriveL, the template's odometry into chassis.odom.
//
//  Only the BODIES differ, and they live in mock/drive.cpp. When g++ compiles
//  autons.cpp it needs only these signatures; it leaves a placeholder for each
//  call and the linker fills it in later. On the brain the linker supplies the
//  template's drive.cpp, which spins motors. Here it supplies mock/drive.cpp,
//  which writes the call down instead.
//
//  The one addition is a final `at` parameter on every method that moves the
//  robot. It is defaulted, so every existing call still compiles as written,
//  and the compiler fills it with the caller's file and line (see vex.h).
// ============================================================================
#include "vex.h"

enum drive_setup {
  ZERO_TRACKER_NO_ODOM, ZERO_TRACKER_ODOM, TANK_ONE_ENCODER, TANK_ONE_ROTATION,
  TANK_TWO_ENCODER, TANK_TWO_ROTATION, HOLONOMIC_TWO_ENCODER, HOLONOMIC_TWO_ROTATION
};

class Drive {
private:
  float wheel_diameter;
  float wheel_ratio;
  float gyro_scale;
  float drive_in_to_deg_ratio;

public:
  drive_setup drive_setup = ZERO_TRACKER_NO_ODOM;
  vex::motor_group DriveL;
  vex::motor_group DriveR;
  vex::inertial Gyro;
  vex::motor DriveLF, DriveRF, DriveLB, DriveRB;
  vex::rotation R_ForwardTracker, R_SidewaysTracker;
  vex::encoder E_ForwardTracker, E_SidewaysTracker;

  float turn_max_voltage = 0, turn_kp = 0, turn_ki = 0, turn_kd = 0, turn_starti = 0;
  float turn_settle_error = 0, turn_settle_time = 0, turn_timeout = 0;
  float drive_max_voltage = 0, drive_kp = 0, drive_ki = 0, drive_kd = 0, drive_starti = 0;
  float drive_settle_error = 0, drive_settle_time = 0, drive_timeout = 0;
  float heading_max_voltage = 0, heading_kp = 0, heading_ki = 0, heading_kd = 0, heading_starti = 0;
  float swing_max_voltage = 0, swing_kp = 0, swing_ki = 0, swing_kd = 0, swing_starti = 0;
  float swing_settle_error = 0, swing_settle_time = 0, swing_timeout = 0;
  float desired_heading = 0;

  Drive(enum ::drive_setup drive_setup, vex::motor_group DriveL, vex::motor_group DriveR,
        int gyro_port, float wheel_diameter, float wheel_ratio, float gyro_scale,
        int DriveLF_port, int DriveRF_port, int DriveLB_port, int DriveRB_port,
        int ForwardTracker_port, float ForwardTracker_diameter,
        float ForwardTracker_center_distance, int SidewaysTracker_port,
        float SidewaysTracker_diameter, float SidewaysTracker_center_distance);

  // What the simulator needs from the constructor, read back when the log is
  // written: the wheel, the gearing and the drive motors' cartridge.
  float  wheel_diameter_in() const { return wheel_diameter; }
  float  wheel_gear_ratio() const  { return wheel_ratio; }
  float  gyro_scale_value() const  { return gyro_scale; }
  double cartridge_rpm() const     { return DriveL.first ? DriveL.first->cartridge_rpm() : 0; }

  void drive_with_voltage(float leftVoltage, float rightVoltage, src_loc at = src_loc::current());

  float get_absolute_heading();
  float get_left_position_in();
  float get_right_position_in();

  void set_turn_constants(float turn_max_voltage, float turn_kp, float turn_ki, float turn_kd, float turn_starti, src_loc at = src_loc::current());
  void set_drive_constants(float drive_max_voltage, float drive_kp, float drive_ki, float drive_kd, float drive_starti, src_loc at = src_loc::current());
  void set_heading_constants(float heading_max_voltage, float heading_kp, float heading_ki, float heading_kd, float heading_starti, src_loc at = src_loc::current());
  void set_swing_constants(float swing_max_voltage, float swing_kp, float swing_ki, float swing_kd, float swing_starti, src_loc at = src_loc::current());

  void set_turn_exit_conditions(float turn_settle_error, float turn_settle_time, float turn_timeout, src_loc at = src_loc::current());
  void set_drive_exit_conditions(float drive_settle_error, float drive_settle_time, float drive_timeout, src_loc at = src_loc::current());
  void set_swing_exit_conditions(float swing_settle_error, float swing_settle_time, float swing_timeout, src_loc at = src_loc::current());

  void turn_to_angle(float angle, src_loc at = src_loc::current());
  void turn_to_angle(float angle, float turn_max_voltage, src_loc at = src_loc::current());
  void turn_to_angle(float angle, float turn_max_voltage, float turn_settle_error, float turn_settle_time, float turn_timeout, src_loc at = src_loc::current());
  void turn_to_angle(float angle, float turn_max_voltage, float turn_settle_error, float turn_settle_time, float turn_timeout, float turn_kp, float turn_ki, float turn_kd, float turn_starti, src_loc at = src_loc::current());

  void drive_distance(float distance, src_loc at = src_loc::current());
  void drive_distance(float distance, float heading, src_loc at = src_loc::current());
  void drive_distance(float distance, float heading, float drive_max_voltage, float heading_max_voltage, src_loc at = src_loc::current());
  void drive_distance(float distance, float heading, float drive_max_voltage, float heading_max_voltage, float drive_settle_error, float drive_settle_time, float drive_timeout, src_loc at = src_loc::current());
  void drive_distance(float distance, float heading, float drive_max_voltage, float heading_max_voltage, float drive_settle_error, float drive_settle_time, float drive_timeout, float drive_kp, float drive_ki, float drive_kd, float drive_starti, float heading_kp, float heading_ki, float heading_kd, float heading_starti, src_loc at = src_loc::current());

  void left_swing_to_angle(float angle, src_loc at = src_loc::current());
  void left_swing_to_angle(float angle, float swing_max_voltage, float swing_settle_error, float swing_settle_time, float swing_timeout, float swing_kp, float swing_ki, float swing_kd, float swing_starti, src_loc at = src_loc::current());
  void right_swing_to_angle(float angle, src_loc at = src_loc::current());
  void right_swing_to_angle(float angle, float swing_max_voltage, float swing_settle_error, float swing_settle_time, float swing_timeout, float swing_kp, float swing_ki, float swing_kd, float swing_starti, src_loc at = src_loc::current());

  Odom odom;
  void set_coordinates(float X_position, float Y_position, float orientation_deg, src_loc at = src_loc::current());
  void set_heading(float orientation_deg, src_loc at = src_loc::current());
  void position_track();
  static int position_track_task();
  vex::task odom_task;
  float get_X_position();
  float get_Y_position();

  // Recorded but not yet simulated: they depend on odometry, which the
  // simulator does not model. The viewer says so when a routine uses them.
  void drive_to_point(float X_position, float Y_position, src_loc at = src_loc::current());
  void drive_to_point(float X_position, float Y_position, float drive_max_voltage, float heading_max_voltage, src_loc at = src_loc::current());
  void drive_to_point(float X_position, float Y_position, float drive_max_voltage, float heading_max_voltage, float drive_settle_error, float drive_settle_time, float drive_timeout, src_loc at = src_loc::current());
  void drive_to_point(float X_position, float Y_position, float drive_max_voltage, float heading_max_voltage, float drive_settle_error, float drive_settle_time, float drive_timeout, float drive_kp, float drive_ki, float drive_kd, float drive_starti, float heading_kp, float heading_ki, float heading_kd, float heading_starti, src_loc at = src_loc::current());
  void turn_to_point(float X_position, float Y_position, src_loc at = src_loc::current());
  void turn_to_point(float X_position, float Y_position, float extra_angle_deg, src_loc at = src_loc::current());
  void turn_to_point(float X_position, float Y_position, float extra_angle_deg, float turn_max_voltage, float turn_settle_error, float turn_settle_time, float turn_timeout, src_loc at = src_loc::current());
  void turn_to_point(float X_position, float Y_position, float extra_angle_deg, float turn_max_voltage, float turn_settle_error, float turn_settle_time, float turn_timeout, float turn_kp, float turn_ki, float turn_kd, float turn_starti, src_loc at = src_loc::current());

  float get_ForwardTracker_position();
  float get_SidewaysTracker_position();

  // Driver control. Defined WEAKLY in mock/drive.cpp: our template defines
  // control_arcade and control_holonomic in drive.cpp but leaves control_tank
  // to each team's user.cpp. A weak definition is used only if no other file
  // supplies one, so both layouts link.
  void control_arcade();
  void control_tank();
  void control_holonomic();
};
