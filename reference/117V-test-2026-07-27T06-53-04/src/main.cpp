 #include "vex.h"
#include "autons.h"
#include "user.h"
// ---- START VEXCODE CONFIGURED DEVICES ----
// Robot Configuration:
// [Name]               [Type]        [Port(s)]
// Inertial             inertial      15              
// left1                motor         13              
// left2                motor         12              
// left3                motor         11              */
// right1         s      motor         18              
// right2               motor         19              
// right3               motor         20              
// wing                 digital_out   A               
// climb1               digital_out   F               
// climb2               digital_out   H               
// shooter              motor         16              
// collectR             motor         14              
// collectL             motor         17              
// Controller1          controller                    
// ---- END VEXCODE CONFIGURED DEVICES ----

using namespace vex;
competition Competition;

int thread1=0;

int fff=0;

int display()
{
  while(1)
  {
    Controller1.Screen.setCursor(1,1);
    Controller1.Screen.print("GYROz%.2f",Gyro.rotation());
  }
}
task a(display);

Drive chassis(

ZERO_TRACKER_ODOM,

motor_group(leftA, leftB, leftC),

motor_group(rightA, rightB, rightC),

PORT11,//惯性传感器端口

3.25,//输入轮子的直径
//4.125
//3.25
//2.75

0.75,//输入齿轮/输出齿轮算出齿轮比

360,//陀螺仪比例
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

int current_auton_selection = 0;
bool auto_started = false;

/**
 * Function before autonomous. It prints the current auton number on the screen
 * and tapping the screen cycles the selected auton by 1. Add anything else you
 * may need, like resetting pneumatic components. You can rename these autons to
 * be more descriptive, if you like.
 */

void pre_auton(void) {
  vexcodeInit();
  default_constants();
  while(!auto_started){
    Brain.Screen.clearScreen();
    Brain.Screen.setFont(monoXL);
    Brain.Screen.setFillColor(purple);
    Brain.Screen.setCursor(1, 1);
    Brain.Screen.print("GYRO:%.2f",Gyro.rotation());
    switch(current_auton_selection){
      case 0:
        Brain.Screen.setFillColor(red);
        Brain.Screen.printAt(10, 120, "left 1+5 ");
        break;
      case 1:
        Brain.Screen.setFillColor(blue);
        Brain.Screen.printAt(10, 120, "right 0+4 ");
        break;
      case 2:
        Brain.Screen.setFillColor(purple);
        Brain.Screen.printAt(10, 120,"skills left");
        break;

    }
    if(Brain.Screen.pressing()){
      while(Brain.Screen.pressing()) {}
      current_auton_selection ++;
    } else if (current_auton_selection == 2){
      current_auton_selection = 0;
    }
    task::sleep(10);
  } 
}

void autonomous(void) 
{
  //根据选择程序进入自动程序
  descore.set(0);
   switch(current_auton_selection)
   { 
    case 0:
      zuo();//zuo()
      break;
    case 1:         
      lanyou();
      break;
    case 2:
      skillszuo();
      break;
    } 
    
  just_stop(0);

}


void usercontrol(void) {
 // descore.set(1);
  just_stop(0);

  while (1) 
  {
    chassis.control_tank();
    UserCollect();
    handle();

    /*if(Controller1.ButtonX.pressing())
    {
      zuo();
    }
     
    if(Controller1.ButtonDown.pressing())
    {
      lanyou();
    }*/
 
  }

}



int main() {
  Competition.autonomous(autonomous);
  Competition.drivercontrol(usercontrol);
  pre_auton();
  while (true) {
    wait(100, msec);
  }
  return 0;
}

