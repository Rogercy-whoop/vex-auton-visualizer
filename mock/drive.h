#pragma once
// ============================================================================
//  mock/drive.h  --  THE SEAM
// ----------------------------------------------------------------------------
//  This is the file that makes the whole project work. Every declaration below
//  is copied from the template's drive.h so that the SIGNATURES match exactly.
//
//  Why signatures and not behaviour: when g++ compiles autons.cpp it only needs
//  to know a function's name, parameter types and return type. It emits a
//  placeholder for the call and trusts the linker to supply a body later. On
//  the V5 brain the linker supplies the template's drive.cpp, which spins
//  motors. Here it supplies mock/drive.cpp, which writes JSON. autons.cpp is
//  identical in both cases and does not know the difference.
//
//  If any signature below drifts from the template's, the link fails loudly --
//  which is the behaviour we want. A silent mismatch would be far worse.
// ============================================================================

enum drive_setup {
  ZERO_TRACKER_NO_ODOM, ZERO_TRACKER_ODOM, TANK_ONE_ENCODER, TANK_ONE_ROTATION,
  TANK_TWO_ENCODER, TANK_TWO_ROTATION, HOLONOMIC_TWO_ENCODER,
  HOLONOMIC_TWO_ROTATION
};

class Drive {
private:
  float wheel_diameter;
  float wheel_ratio;
  float gyro_scale;
  float drive_in_to_deg_ratio;

public:
  // These are public in the template and autons.cpp writes to them directly
  // (chassis.drive_timeout = 1600). Making them private would break the build.
  float turn_max_voltage = 0, turn_kp = 0, turn_ki = 0, turn_kd = 0, turn_starti = 0;
  float turn_settle_error = 0, turn_settle_time = 0, turn_timeout = 0;

  float drive_max_voltage = 0, drive_kp = 0, drive_ki = 0, drive_kd = 0, drive_starti = 0;
  float drive_settle_error = 0, drive_settle_time = 0, drive_timeout = 0;

  float heading_max_voltage = 0, heading_kp = 0, heading_ki = 0, heading_kd = 0, heading_starti = 0;

  float swing_max_voltage = 0, swing_kp = 0, swing_ki = 0, swing_kd = 0, swing_starti = 0;
  float swing_settle_error = 0, swing_settle_time = 0, swing_timeout = 0;

  float desired_heading = 0;

  // Same 17 parameters as the template, in the same order, so the chassis
  // declaration can be copied verbatim out of main.cpp.
  Drive(enum ::drive_setup drive_setup, motor_group DriveL, motor_group DriveR,
        int gyro_port, float wheel_diameter, float wheel_ratio, float gyro_scale,
        int DriveLF_port, int DriveRF_port, int DriveLB_port, int DriveRB_port,
        int ForwardTracker_port, float ForwardTracker_diameter,
        float ForwardTracker_center_distance, int SidewaysTracker_port,
        float SidewaysTracker_diameter, float SidewaysTracker_center_distance);

  void set_turn_constants(float turn_max_voltage, float turn_kp, float turn_ki, float turn_kd, float turn_starti);
  void set_drive_constants(float drive_max_voltage, float drive_kp, float drive_ki, float drive_kd, float drive_starti);
  void set_heading_constants(float heading_max_voltage, float heading_kp, float heading_ki, float heading_kd, float heading_starti);
  void set_swing_constants(float swing_max_voltage, float swing_kp, float swing_ki, float swing_kd, float swing_starti);

  void set_turn_exit_conditions(float turn_settle_error, float turn_settle_time, float turn_timeout);
  void set_drive_exit_conditions(float drive_settle_error, float drive_settle_time, float drive_timeout);
  void set_swing_exit_conditions(float swing_settle_error, float swing_settle_time, float swing_timeout);

  void turn_to_angle(float angle);
  void turn_to_angle(float angle, float turn_max_voltage);
  void turn_to_angle(float angle, float turn_max_voltage, float turn_settle_error, float turn_settle_time, float turn_timeout);

  void drive_distance(float distance);
  void drive_distance(float distance, float heading);
  void drive_distance(float distance, float heading, float drive_max_voltage, float heading_max_voltage);
  void drive_distance(float distance, float heading, float drive_max_voltage, float heading_max_voltage,
                      float drive_settle_error, float drive_settle_time, float drive_timeout);

  void left_swing_to_angle(float angle);
  void right_swing_to_angle(float angle);

  void drive_with_voltage(float leftVoltage, float rightVoltage);

  // Odometry getters exist so the interface is complete, but they return the
  // constant 0 -- which is exactly what the real robot does, because
  // set_coordinates() is never called and the tracking task never starts.
  float get_absolute_heading();
  float get_X_position();
  float get_Y_position();
};
