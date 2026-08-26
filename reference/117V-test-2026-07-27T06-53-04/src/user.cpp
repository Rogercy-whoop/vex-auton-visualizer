#include "vex.h"
#include "user.h"

int f1= 0;
int f2= 0;
int f3 = 0;
int f4 = 0;
int f5=0;
int sudu = 100;

//底盘操控方式
 void Drive::control_tank(){
   float throttle = deadband(controller(primary).Axis3.value(), 5);
   float turn = deadband(controller(primary).Axis1.value(), 5);
   DriveL.spin(fwd, to_volt(throttle+turn), volt);
   DriveR.spin(fwd, to_volt(throttle-turn), volt);
 }

 //void Drive::control_tank(){
  //float leftthrottle = deadband(controller(primary).Axis3.value(), 5)*0.7;
  //float rightthrottle = deadband(controller(primary).Axis2.value(), 5)*0.7;
  //DriveL.spin(fwd, to_volt(leftthrottle), volt);
  //DriveR.spin(fwd, to_volt(rightthrottle), volt);
//}

void UserCollect()
{
    if(Controller1.ButtonL1.pressing())
    {
      //存球
      intake.spin(reverse,100,pct);
      //shooter.spin(reverse, 10, pct);
    }
    else if(Controller1.ButtonL2.pressing())
    {
       //吐球
      intake.spin(forward,100,pct);
      shooter.spin(reverse, 10, pct);
   
    }
    else if(Controller1.ButtonR1.pressing())
    {
      //长杆
      intake.spin(reverse,100,pct);
      shooter.spin(forward, 100, pct);
    }
    else if(Controller1.ButtonR2.pressing())
    {
      //中杆
      midbar.set(true);
      intake.spin(reverse,100,pct);
      shooter.spin(forward,40, pct);
    }
    else
    {
      intake.stop();
      shooter.stop();
      midbar.set(false);
    }
}


void handle()
{
  if(Controller1.ButtonB.pressing()){
    matchload.set(!matchload.value());
    while(Controller1.ButtonB.pressing()){
      wait(10,msec);
    }
  }

  if(Controller1.ButtonY.pressing()){
    descore.set(!descore.value());
    while(Controller1.ButtonY.pressing()){
      wait(10,msec);
    }
  }
}


   


 