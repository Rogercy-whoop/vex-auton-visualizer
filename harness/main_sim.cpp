// ============================================================================
//  harness/main_sim.cpp  --  the laptop-side entry point
// ----------------------------------------------------------------------------
//  Replaces the team's main() -- which is still compiled, renamed out of the
//  way, because it also defines the chassis. This main does one thing: run ONE
//  routine and write down everything it asked the robot to do.
//
//    vexsim.exe --list                 print the routines found in autons.cpp
//    vexsim.exe <routine> <out.json>   run one routine, write its action log
//
//  The build runs each routine in a fresh process, so no routine can inherit
//  state from another -- the equivalent of switching the brain off and on.
// ============================================================================
#include "vex.h"
#include "recorder.h"
#include "registry.h"
#include <cstdio>
#include <cstring>
#include <fstream>

int main(int argc, char** argv) {
  vexsim_name_devices();

  if (argc >= 2 && std::strcmp(argv[1], "--list") == 0) {
    for (int i = 0; i < VEXSIM_N_ROUTINES; ++i) std::printf("%s\n", VEXSIM_ROUTINES[i].name);
    return 0;
  }
  if (argc < 3) {
    std::fprintf(stderr, "usage: vexsim --list | vexsim <routine> <out.json>\n");
    return 2;
  }

  const Routine* r = nullptr;
  for (int i = 0; i < VEXSIM_N_ROUTINES; ++i)
    if (std::strcmp(VEXSIM_ROUTINES[i].name, argv[1]) == 0) r = &VEXSIM_ROUTINES[i];
  if (!r) { std::fprintf(stderr, "unknown routine '%s'\n", argv[1]); return 2; }

  // On the robot, pre_auton() has run by the time a routine starts. It cannot
  // be called here -- it loops on the brain's screen waiting for a tap -- so
  // the part of it that matters, default_constants(), is called directly.
  vexsim_default_constants();
  sim::reset();                             // the log starts at the routine

  bool overran = false;
  try {
    r->fn();                                // the team's unmodified routine
  } catch (const vex::overrun& o) {
    overran = true;                         // keep everything up to the stop
  }

  std::ofstream out(argv[2]);
  if (!out) { std::fprintf(stderr, "cannot write %s\n", argv[2]); return 1; }
  out << sim::build_json(r->name, overran) << "\n";

  std::printf("  %-14s %4zu actions  %8.0f ms%s\n", r->name, sim::action_count(),
              vex::sim_now_ms(), overran ? "   STOPPED: ran past 3 min" : "");
  return 0;
}
