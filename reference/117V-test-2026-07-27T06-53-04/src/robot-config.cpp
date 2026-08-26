#include "vex.h"

using namespace vex;
using signature = vision::signature;
using code = vision::code;

brain  Brain;


controller Controller1 = controller(primary);

motor leftA = motor(PORT15, ratio6_1, true);
motor leftB = motor(PORT16, ratio6_1, true);
motor leftC = motor(PORT17, ratio6_1, true);
motor rightA = motor(PORT12, ratio6_1, false);
motor rightB = motor(PORT13, ratio6_1, false);
motor rightC = motor(PORT14, ratio6_1, false);

motor intake = motor(PORT8, ratio6_1, true);
motor shooter = motor(PORT9, ratio6_1, true);


//
digital_out midbar = digital_out(Brain.ThreeWirePort.A);
digital_out matchload = digital_out(Brain.ThreeWirePort.B);
digital_out descore = digital_out(Brain.ThreeWirePort.C);


inertial Gyro = inertial(PORT11);

bool RemoteControlCodeEnabled = true;
void vexcodeInit( void ) {}