# Attribution

This repository contains work by more than one author. This file states
exactly which is which.

## Written by me (Rogerchenyu / Rogercy-whoop, VEX team 117V)

| Path | What it is |
|---|---|
| `mock/` | The mock VEX API — fake hardware layer that records commands instead of driving motors |
| `harness/` | The compile-and-run entry point that produces the action log |
| `viewer/` | The HTML/Canvas path viewer |
| `reference/.../src/autons.cpp` | **All five autonomous routines**, all PID constants, all exit conditions, all timeout tuning |
| `reference/.../src/user.cpp` | Driver control and mechanism bindings |
| `reference/.../src/autofunction.cpp` | Intake/shooter helper routines |
| `reference/.../src/main.cpp` | Chassis configuration and auton selector (partly mine) |

## NOT written by me — teacher-supplied competition template

| Path | What it is |
|---|---|
| `reference/.../src/auto-Template/drive.cpp` | Drive class, PID motion functions, odometry integration |
| `reference/.../src/auto-Template/odom.cpp` | Arc-based position tracking |
| `reference/.../src/auto-Template/PID.cpp` | PID class, anti-windup, settle logic |
| `reference/.../src/auto-Template/util.cpp` | Angle wrapping, clamping, unit conversion |
| `reference/.../include/auto-Template/` | Corresponding headers |

The control template was supplied by my school's coach. It closely resembles
the publicly available JAR Template. **I did not write the control library.**

It is included here for one reason: this project works by compiling my
unmodified `autons.cpp` against a *mock* of that template's interface. To
write a mock with matching function signatures, the original interface has
to be readable. The template files are reference material, not a
contribution.

What I did with the template was operate it for two seasons, tune it
empirically, and eventually read it line by line — which is where this
project came from. See the study notes for what that investigation found.

## Third-party

VEX Robotics field dimensions used to draw the field are taken from the
public 2025-26 V5RC Push Back field specification drawings. The field is
drawn procedurally from those measurements; no VEX artwork is redistributed.
