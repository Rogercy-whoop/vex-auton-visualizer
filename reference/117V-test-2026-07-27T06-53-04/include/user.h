#pragma once
#include "vex.h"

//机器手动子程序定义
void UserCollect();
void Chassis();
void handle();//气动

//自动程序定义
void intake_hold(int speed);
void intake_high(int speed);
void intake_mid(int speed);
void just_stop(int stopmod=1);


