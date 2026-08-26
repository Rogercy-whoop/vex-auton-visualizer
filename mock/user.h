#pragma once
#include "vex.h"

// The four helpers autons.cpp calls, declared exactly as in the real user.h
// (including the default argument on just_stop -- an overload set that does
// not match would fail to link).
void intake_hold(int speed);
void intake_high(int speed);
void intake_mid(int speed);
void just_stop(int stopmod = 1);
