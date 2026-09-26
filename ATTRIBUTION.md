# Attribution

This repository contains work from three sources. This file says exactly
which is which, file by file.

## Mine — Rogercy-whoop, VEX team 117V

| Path | What it is |
|---|---|
| `reference/…/src/autons.cpp` | **All five autonomous routines** — every PID constant, exit condition and timeout. This is the code the simulator exists to test. |
| `reference/…/src/autofunction.cpp` | Intake and shooter helper routines |
| `reference/…/src/user.cpp` | Driver control and mechanism bindings |
| `reference/…/src/main.cpp` | Chassis configuration and auton selector (partly mine) |

For the simulator itself, what is mine is the direction: the problem it
solves, the architecture (a mock hardware layer at the linker seam, with no
C++ parsing), the requirements for each feature, all the robot-specific
knowledge the model depends on, and the review and correction of every stage.

## Written with Claude (Anthropic's AI coding assistant), under my direction

| Path | What it is |
|---|---|
| `mock/` | The mock VEX SDK and `Drive` class that the linker substitutes on a laptop |
| `harness/` | The entry point that runs each routine and writes the action log |
| `viewer/` | The simulator (control-loop replay, collision, intake) and the Canvas viewer |
| `build.bat`, `watch.bat` | Build and rebuild-on-save scripts |
| `docs/FINDINGS.md`, `docs/architecture.svg`, `NOTES-future.md` | Drafted from our working sessions |

I set the requirements, and reviewed and corrected each stage; the assistant
wrote the code. Later commits carry a `Co-Authored-By` trailer. The earliest
commits were made the same way but predate it.

## Not mine — teacher-supplied competition template

| Path | What it is |
|---|---|
| `reference/…/src/auto-Template/drive.cpp` | Drive class, PID motion functions, odometry integration |
| `reference/…/src/auto-Template/odom.cpp` | Arc-based position tracking |
| `reference/…/src/auto-Template/PID.cpp` | PID class, anti-windup, settle logic |
| `reference/…/src/auto-Template/util.cpp` | Angle wrapping, clamping, unit conversion |
| `reference/…/include/auto-Template/` | Corresponding headers |

The control template was supplied by my school's coach. It closely resembles
the publicly available JAR Template. **I did not write the control library.**

It is included for one reason: this project works by compiling my unmodified
`autons.cpp` against a *mock* of that template's interface, and a mock with
matching signatures can only be written — and checked — against the
original. The template files are reference material, not a contribution.

What I did with the template was operate it for two seasons, tune it
empirically, and eventually read it line by line — which is where this
project came from.

## Third-party

Field dimensions are taken from the public VEX 2025–26 V5RC *Push Back* field
specification drawings. The field is drawn procedurally from those
measurements; no VEX artwork is redistributed.
