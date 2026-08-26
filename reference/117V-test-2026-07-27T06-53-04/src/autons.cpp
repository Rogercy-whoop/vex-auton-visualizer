#include "vex.h"
#include "user.h"
#include <iostream>

timer Tauto;

const int one_unit = 24;

void default_constants() {
  //调试PID参数，分别是（最大电压，KP,KI,KD,statI参数）
  chassis.set_drive_constants(12, 0.7, 0.01, 0, 0);
  chassis.set_heading_constants(12, 0.10, 0.002, 0.7, 0);
  chassis.set_turn_constants(12, 0.47, 0.0005, 3.8, 0);
  chassis.set_swing_constants(7, .3, .001, 2, 15);

  //设置程序跳出条件（误差，时间，时间截止）都是以ms为单位的
  chassis.set_drive_exit_conditions(0, 180, 900);
  chassis.set_turn_exit_conditions(1, 180, 900);
  chassis.set_swing_exit_conditions(1, 180, 900);
}


void test()
{
  
  //chassis.set_drive_exit_conditions(0,180,900);
  chassis.drive_distance(30/2.54,-135,9,4);

}

void zuo()
{
  //距离左边垫子3格
  Tauto.clear();
  default_constants();

  //吸中间3球
  intake_hold(100);
  chassis.drive_distance(45/2.54,-32,6,6);
  matchload.set(true);//拍球不让球跑
  chassis.drive_distance(33/2.54,-25,5,3);
  chassis.turn_to_angle(-123,8);
  
  chassis.drive_distance(-30/2.54,-125,5,5);
  intake_hold(0);
  
  //放中上goal
  intake_high(100);
  wait(0.9,sec);
  intake_high(0);
  matchload.set(false);
  chassis.turn_timeout=700;
  chassis.turn_to_angle(-135,8);
  chassis.turn_timeout=900;
  chassis.drive_timeout=1600;

  //往前走，吸导入桶内的球
  chassis.drive_distance(127/2.54,-145,10,10);//130
  matchload.set(true);
  chassis.drive_timeout=900;
  chassis.turn_timeout=700;
  chassis.turn_to_angle(-182,9);
  
  intake_hold(100);//存球

  //chassis.drive_distance(-20/2.54,-180,4,4);
  //往前走，插进去
  chassis.drive_distance(45/2.54,-180,5,5);

  wait(0.2,sec);
  //后退分段放球
  chassis.drive_distance(-70/2.54,-182,5,5);
  chassis.drive_timeout=500;
  //chassis.drive_distance(20/2.54,-180,5,5);
  chassis.drive_distance(-38/2.54,-180,11,11);
  intake_high(100);//放球
  matchload.set(false);

  chassis.drive_distance(-60/2.54,-181.5,7,7);
  wait(1.7,sec);
  intake_hold(0);
  
  //退出来上钩子
  chassis.drive_timeout=600;
  chassis.turn_timeout=600;
  //chassis.drive_distance(60/2.54,-230,7,7);
  chassis.turn_to_angle(-230,7);
  chassis.drive_distance(25/2.54,-230,6,6);
  chassis.turn_to_angle(-188,7);
  chassis.drive_distance(-70/2.54,-188,7,7);
  chassis.turn_to_angle(-180,5);
  just_stop(0);
 
  std::cout<<"time:"<<Tauto.time()/1000<<std::endl;
}

void superzuo()
{
  //多两格，中间三个球往下摆一点！
  Tauto.clear();
  default_constants();

  chassis.set_drive_exit_conditions(0,180,1200);
  chassis.drive_distance(79/2.54,0,7,7);
  matchload.set(true);
  chassis.set_turn_exit_conditions(1,180,650);
  chassis.turn_to_angle(-90,9);

  //吸导入
  chassis.set_drive_exit_conditions(0,180,950);
  intake_hold(100);
  chassis.drive_distance(46/2.54,-90,7,7);

  //放长桥
  chassis.set_drive_exit_conditions(0,180,850);
  chassis.drive_distance(-70/2.54,-92,8,8);
  matchload.set(false);
  chassis.set_drive_exit_conditions(0,180,2000);
  intake_high(100);
  chassis.drive_distance(-80/2.54,-90,4,4);          

  chassis.set_drive_exit_conditions(0,180,800);
  chassis.drive_distance(30/2.54,135,9,4);
  intake_hold(100);
  chassis.drive_distance(55/2.54,146,8,8);
  chassis.drive_distance(32/2.54,146,3,3);

  chassis.set_turn_exit_conditions(1,180,700);
  chassis.turn_to_angle(-51,9);//49
  intake_hold(0);
  chassis.drive_distance(-20/2.54,-56,6,2);//21 53 1.5
  //wait(2,sec);
  intake_high(70);
  wait(1.8,sec);

  chassis.set_turn_exit_conditions(1,180,300);
  chassis.drive_distance(-30/2.54,-45,10,1.5);
  chassis.set_drive_exit_conditions(0,180,1300);//1200
  chassis.drive_distance(102/2.54,-45,9,9);//100
  chassis.turn_to_angle(-95,9);
  chassis.drive_distance(-60/2.54,-90,9,9);

  just_stop(0);
  std::cout<<"time:"<<Tauto.time()/1000.0<<std::endl;
}

void skillszuo()
{
  Tauto.clear();
  default_constants();

  //机器摆位在奇怪的图案后一格
  descore.set(true);
  chassis.set_drive_exit_conditions(0,180,1200);
  chassis.drive_distance(79/2.54,0,7,7);
  matchload.set(true);
  chassis.set_turn_exit_conditions(1,180,650);
  chassis.turn_to_angle(-90,9);

  //吸导入
  chassis.set_drive_exit_conditions(0,180,1900);
  intake_hold(100);
  
  chassis.drive_distance(48/2.54,-90,7,7);//46
  wait(0.5,sec);
  shooter.stop();
  chassis.drive_timeout=900;
  chassis.drive_distance(-50/2.54,-90,8,8);
  matchload.set(false);
  chassis.turn_timeout=700;
  chassis.turn_to_angle(0,6);
  chassis.drive_distance(35/2.54,0,7,7);
  chassis.turn_to_angle(90,6);
  chassis.drive_timeout=1800;
  chassis.drive_distance(190/2.54,90,9,9);
  intake_hold(0);
  chassis.turn_to_angle(180,6);
  chassis.drive_timeout=750;
  chassis.drive_distance(32/2.54,180,8,8);
  //chassis.turn_timeout=400;
  chassis.turn_to_angle(90,7);
  chassis.drive_distance(-29/2.54,90,7,7);
  matchload.set(true);
  intake_high(100);
  wait(2,sec);
  intake_high(0);
  
  //wait(10,sec);
  //第二段吸导入
  intake_hold(100);
  chassis.drive_timeout=1300;
  shooter.spin(fwd,10,pct);
  chassis.drive_distance(80/2.54,90,9,9);
  wait(1.5,sec);
  shooter.stop();
  
  chassis.drive_distance(-70/2.54,90,5,5);
  chassis.drive_timeout=500;
  chassis.drive_distance(-40/2.54,90,8,8);
  intake_high(100);//放球
  matchload.set(false);
  chassis.drive_distance(-60/2.54,90,7,7);
  wait(2,sec);
  intake_hold(0);
  
  chassis.drive_distance(35/2.54,90,7,7);
  chassis.turn_to_angle(180,5);
  chassis.drive_timeout=2000;
  
  //长距离移动
  chassis.drive_distance(241/2.54,180,10,10);
  wait(1,sec);
  matchload.set(true);
  chassis.turn_to_angle(90,7);
  intake_hold(100);
  shooter.spin(fwd,10,pct);
  chassis.drive_distance(40/2.54,90,7,7);
  wait(0.5,sec);
  shooter.stop();

  chassis.drive_timeout=1000;
  chassis.drive_distance(-60/2.54,90,7,7);
  matchload.set(false);
  chassis.turn_timeout=600;
  chassis.drive_timeout=600;
  chassis.turn_to_angle(180,8);
  chassis.drive_distance(34/2.54,180,7,7);
  chassis.turn_to_angle(271,7);
  chassis.drive_timeout=1800;
  chassis.drive_distance(190/2.54,273,8,8);
  intake_hold(0);
  chassis.turn_to_angle(0,8);
  chassis.drive_timeout=900;
  chassis.drive_distance(30/2.54,0,9,9);
  //chassis.turn_timeout=400;
  chassis.turn_to_angle(-90,8);
  chassis.drive_timeout=1100;
  chassis.drive_distance(-30/2.54,-90,9,9);
  intake_high(100);
  wait(2,sec);
  intake_high(0);

  matchload.set(true);
  intake_hold(100);
  chassis.drive_timeout=1300;
  chassis.drive_distance(80/2.54,-90,8,8);
  wait(1.1,sec);
  shooter.spin(fwd,10,pct);
  wait(520,msec);
  shooter.stop();

  chassis.drive_distance(-70/2.54,-90,5,5);
  chassis.drive_timeout=500;
  chassis.drive_distance(-38/2.54,-90,11,11);
  intake_high(100);//放球
  matchload.set(false);
  chassis.drive_distance(-60/2.54,-90,7,7);
  wait(2,sec);
  intake_hold(0);

  chassis.drive_distance(30/2.54,-90,7,7);
  chassis.turn_to_angle(0,8);
  chassis.drive_timeout=1100;
  chassis.drive_distance(-50/2.54,0,6,6);
  chassis.drive_timeout=1800;
  chassis.drive_distance(165/2.54,0,7,7);
  wait(1,sec);
  chassis.turn_to_angle(-90,8);
  wait(0.5,sec);
  intake_hold(100);
  chassis.drive_timeout=2000;
  chassis.drive_distance(102/2.54,-90,11,11);
  wait(10,sec);

  just_stop(0);
  std::cout<<"time:"<<Tauto.time()/1000.0<<std::endl;
}

void lanyou()
{
//距离左边垫子3.5格
  Tauto.clear();
  default_constants();

  //吸中间3球
  intake_hold(100);
  chassis.drive_distance(45/2.54,33,6,6);
  matchload.set(true);//拍球不让球跑
  chassis.drive_distance(33/2.54,25,5,3);
  wait(0.2,sec);
  chassis.turn_to_angle(135,7);
  chassis.drive_timeout=1200;
  intake_hold(0);
  matchload.set(false);//1
  chassis.drive_distance(89/2.54,145,9,9); //91
  //chassis.turn_timeout=1000;
  chassis.turn_to_angle(180,8);
  chassis.drive_timeout=700;
  matchload.set(true);
  chassis.drive_distance(45/2.54,180,9,9);//围边问题 距离或者电压
  intake_hold(100);
  wait(0.8,sec);
  
  chassis.drive_timeout=900;
  //intake_hold(-5);
  chassis.drive_distance(-70/2.54,182,5,5);
  chassis.drive_timeout=800;
  //chassis.drive_distance(20/2.54,-180,5,5);
  intake_high(100);
  chassis.drive_distance(-38/2.54,180,11,11);
  //放球
  wait(1.2,sec);
  intake_high(0);
  matchload.set(false);
  //退出来上钩子
  chassis.drive_timeout=600;
  chassis.turn_timeout=600;
  //chassis.drive_distance(60/2.54,-230,7,7);
  chassis.turn_to_angle(-235,7);
  chassis.drive_distance(20/2.54,-230,6,6);
  chassis.turn_to_angle(-183,7);
  chassis.drive_distance(-70/2.54,-183,6,6);
  chassis.turn_to_angle(-180,10);

  just_stop(0);
  std::cout<<"time:"<<Tauto.time()/1000.0<<std::endl;
}

void superyou()
{
  Tauto.clear();
  default_constants();

  //吸中间3球
  //intake_hold(100);
  //chassis.drive_distance(45/2.54,33,6,6);
  //chassis.drive_distance(33/2.54,25,4,2);
  //chassis.drive_distance(25/2.54,60,7,7);
  intake_hold(100);
  chassis.drive_distance(45/2.54,33,6,6);
  matchload.set(true);//拍球不让球跑
  chassis.drive_distance(33/2.54,25,5,3);
  matchload.set(false);
  chassis.drive_distance(25/2.54,60,7,7);
  matchload.set(true);
  chassis.drive_distance(48/2.54,86,7,5);
  //chassis.drive_distance(13/2.54,87,7,7);
  //chassis.drive_distance(3/2.54,90,3,3);
  wait(0.2,sec);
  chassis.drive_timeout=600;//
  chassis.drive_distance(-15/2.54,80,8,8);
  chassis.drive_distance(-30/2.54,45,8,8);//40
  chassis.turn_timeout=700;
  chassis.turn_to_angle(135,7);//125
  //chassis.drive_timeout=1200;
  chassis.turn_timeout=800;//
  chassis.drive_distance(67/2.54,135,8,8);
  chassis.drive_distance(40/2.54,180,8,7);
  intake_hold(0);
  wait(0.1,sec);

  intake_high(100);
  chassis.drive_distance(-50/2.54,180,6.5,6.5);
  wait(1,sec);
  intake_high(0);
  matchload.set(true);
  
  intake_hold(100);
  chassis.drive_distance(75/2.54,180,7,7);
  wait(0.6,sec);
  intake_hold(0);

  chassis.drive_distance(-78/2.54,180,9,9);//角度 pc在底座中间
  matchload.set(false);
  chassis.drive_timeout=1000;
  intake_high(100);
  chassis.drive_distance(-22/2.54,180,8,8);
  //chassis.drive_distance(-20/2.54,180,8,8);

  wait(1.2,sec);
  intake_high(0);
  //退出来上钩子
  chassis.drive_timeout=600;
  chassis.turn_timeout=600;
  //chassis.drive_distance(60/2.54,-230,7,7);
  chassis.turn_to_angle(-235,7);
  chassis.drive_distance(23/2.54,-230,6,6);
  chassis.turn_to_angle(-184,7);
  chassis.drive_distance(-70/2.54,-184,6,6);
  chassis.turn_to_angle(-180,10);

  just_stop(0);
}