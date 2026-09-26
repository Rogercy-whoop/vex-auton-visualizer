#pragma once
// ============================================================================
//  harness/registry.h  --  what the build generates for each project
// ----------------------------------------------------------------------------
//  Two things differ from team to team and cannot be written into the harness
//  by hand: which routines exist, and what each device is called. The build
//  reads both from the SYMBOL TABLES of the team's compiled files, using `nm`:
//
//    autons.o        -> every global function taking no arguments is a routine
//    robot-config.o  -> every global object is a device, named as declared
//
//  and writes them into two small generated .cpp files that define what this
//  header declares. So discovery is done by the compiler's own output, never
//  by pattern-matching the source.
// ============================================================================

struct Routine {
  const char* name;
  void (*fn)();
};

extern const Routine VEXSIM_ROUTINES[];
extern const int     VEXSIM_N_ROUTINES;

// Calls the team's default_constants() if autons.cpp defines one, as the
// team's pre_auton() does on the robot before any routine runs.
void vexsim_default_constants();

// Gives every device in robot-config.cpp the name it was declared with.
void vexsim_name_devices();
