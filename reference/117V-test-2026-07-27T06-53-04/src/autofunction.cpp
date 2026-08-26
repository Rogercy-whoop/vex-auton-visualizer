#include "vex.h"
#include "user.h"
timer T1;


void intake_hold(int speed)
{
  if(speed==0)
  {
    intake.stop();
    shooter.stop();
  }
  else{
    intake.spin(reverse,speed,pct);
    shooter.stop();
  }
}

void intake_high(int speed)
{
   if(speed==0)
  {
    intake.stop();
    shooter.stop();
  }
  else{
    intake.spin(reverse,speed,pct);
    shooter.spin(forward,speed,pct);
  }
}

void intake_mid(int speed)
{
   if(speed==0)
  {
    intake.stop();
    shooter.stop();
    midbar.set(false);
  }
  else{
    midbar.set(true);
    intake.spin(reverse,speed, pct);
    shooter.spin(fwd,40,pct);
  }
}


void just_stop(int stopmod)
{
    if(stopmod==1)
    {
        leftA.stop(vex::brakeType::brake);
        leftB.stop(vex::brakeType::brake);
        leftC.stop(vex::brakeType::brake);
        rightA.stop(vex::brakeType::brake);
        rightB.stop(vex::brakeType::brake);
        rightC.stop(vex::brakeType::brake);
    }
    else if(stopmod==0)
    {
        leftA.stop(vex::brakeType::coast);
        leftB.stop(vex::brakeType::coast);
        leftC.stop(vex::brakeType::coast);
        rightA.stop(vex::brakeType::coast);
        rightB.stop(vex::brakeType::coast); 
        rightC.stop(vex::brakeType::coast); 
    }
    else if(stopmod==3)
    {
        leftA.stop(vex::brakeType::hold);
        leftB.stop(vex::brakeType::hold);
        leftC.stop(vex::brakeType::hold);
        rightA.stop(vex::brakeType::hold);
        rightB.stop(vex::brakeType::hold); 
        rightC.stop(vex::brakeType::hold);
    }
        leftA.stop();
        leftB.stop();
        leftC.stop();
        rightA.stop();
        rightB.stop(); 
        rightC.stop();
}