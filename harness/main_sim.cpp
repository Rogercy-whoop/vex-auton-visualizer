// ============================================================================
//  harness/main_sim.cpp  --  the laptop-side entry point
// ----------------------------------------------------------------------------
//  Replaces main.cpp. The real one is full of competition callbacks, a screen
//  selector loop and a driver-control loop, none of which we want. This one
//  does three things: build the chassis, run one routine, write the log.
//
//  Usage:  vexsim.exe <routine> [output.json]
// ============================================================================
#include "vex.h"
#include "recorder.h"
#include <cstring>
#include <cstdio>
#include <string>

// --- COPIED VERBATIM FROM src/main.cpp ---------------------------------------
// Not retyped. The wheel diameter, gear ratio and gyro scale below are the
// robot's real calibration constants, and this is the only place they appear
// in the simulator. If the robot's configuration changes, this block is
// re-copied and everything downstream follows.
Drive chassis(

ZERO_TRACKER_ODOM,

motor_group(leftA, leftB, leftC),

motor_group(rightA, rightB, rightC),

PORT11,      // 惯性传感器端口

3.25,        // 输入轮子的直径

0.75,        // 输入齿轮/输出齿轮算出齿轮比

360,         // 陀螺仪比例
//左轮前后端口     右轮前后端口
PORT1,     -PORT3,

PORT10,     -PORT2,
//下面默认就可以了
3,

2.75,

-2,

1,

-2.75,

5.5

);
// --- END COPIED BLOCK --------------------------------------------------------

struct Routine { const char* name; void (*fn)(); };

// The same five routines main.cpp's selector switch can reach, plus `test`.
static const Routine ROUTINES[] = {
  {"zuo",       zuo},
  {"superzuo",  superzuo},
  {"lanyou",    lanyou},
  {"superyou",  superyou},
  {"skillszuo", skillszuo},
  {"test",      test},
};
static const int N_ROUTINES = sizeof(ROUTINES) / sizeof(ROUTINES[0]);

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage: vexsim <routine> [output.json]\navailable routines:\n");
    for (int i = 0; i < N_ROUTINES; ++i) std::printf("  %s\n", ROUTINES[i].name);
    return 1;
  }

  const char* want = argv[1];
  std::string out  = (argc >= 3) ? argv[2] : (std::string("out/") + want + ".json");

  for (int i = 0; i < N_ROUTINES; ++i) {
    if (std::strcmp(ROUTINES[i].name, want) == 0) {
      // This call runs the UNMODIFIED autons.cpp. Everything it touches
      // resolves to the mock, so nothing moves and everything is recorded.
      ROUTINES[i].fn();
      sim::write_log(out, want);
      return 0;
    }
  }

  std::printf("unknown routine '%s'\n", want);
  return 1;
}
