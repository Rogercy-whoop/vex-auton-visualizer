#pragma once
// Mirrors the real robot-config.h exactly: same names, same order.
// autons.cpp reaches for intake, shooter, matchload, descore, midbar and the
// six drive motors, so all of them must exist with these exact identifiers.
using namespace vex;

extern brain Brain;

extern controller Controller1;
extern motor intake;
extern motor shooter;

extern motor leftA;
extern motor leftB;
extern motor rightA;
extern motor rightB;
extern motor leftC;
extern motor rightC;

extern digital_out midbar;
extern digital_out matchload;
extern digital_out descore;

extern inertial Gyro;

void vexcodeInit(void);
