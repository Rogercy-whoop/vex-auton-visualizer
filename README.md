# VEX Auton Visualizer

**See where a VEX V5 autonomous routine will actually go — in about two seconds, without a field.**

It compiles a team's real, unmodified `autons.cpp` on a laptop, replays it through the robot's own PID control loop, and draws the result on a to-scale 2025–26 *Push Back* field: where each move really ends, which moves run out of time before they arrive, where the robot stops against a goal, and which blocks the intake sweeps up.

Built by VEX team **117V** for our own routines.

<!-- To add a screenshot: save one as docs/screenshot.png, then delete these comment markers.
![The viewer running lanyou](docs/screenshot.png)
-->

---

## Why this exists

Testing one change to an autonomous routine used to cost 5–10 minutes: edit, compile, upload over USB, walk to the field, reset every block to its exact starting spot, walk back, run it, watch it fail. Most failures were trivial — a sign error sending the robot backwards, a heading typo, a distance that runs off the field.

Those are now caught in software, before anyone stands up.

It also answers a question the robot itself never could. Our drive loop's `settle_error` is 0, so **every `drive_distance` in our code exits on its timeout, not on arrival** — which means we never actually knew how far a given move got. The simulator runs the real control loop against the real timeouts and reports the gap, move by move.

---

## How it works

![How it works: one source file, two linkers](docs/architecture.svg)

When the compiler builds `autons.cpp`, it only needs each function's **signature** — its name and parameter types. It leaves a placeholder for the call and trusts the **linker** to supply a body later. On the V5 brain the linker supplies the template's `drive.cpp`, which spins motors. On a laptop it supplies [`mock/drive.cpp`](mock/drive.cpp), which records the call instead. `autons.cpp` cannot tell the difference and is never edited.

So nothing parses or interprets C++. The file that gets simulated is, byte for byte, the file that gets uploaded, and switching between the two is one compiler flag: `g++ -I mock`.

The project is three layers, kept deliberately apart:

| Layer | Where | Job |
|---|---|---|
| **Recorder** | [`mock/`](mock/), [`harness/`](harness/) — C++ | Stand in for the VEX SDK. Record every command together with the PID gains and timeouts in force at that moment. Drive nothing. |
| **Simulator** | [`viewer/sim.js`](viewer/sim.js), [`viewer/collide.js`](viewer/collide.js) | Replay the template's `PID.cpp` and move loops line for line at 10 ms, through a drivetrain model with three measurable constants, on a field the robot cannot drive through. |
| **Viewer** | [`viewer/`](viewer/) | Draw it to scale from the official field drawings, with a timeline, measuring tools and warnings. |

Keeping recording separate from simulation means the physics can be re-tuned with a slider instead of a recompile, and the C++ side stays small enough to be very hard to get wrong.

---

## What it shows

- **Two paths.** Dashed is what the code *says* — turn to h, go d. Solid is what the control loop *does* with the timeouts as written. The gap between them is the point.
- **A moves table.** Every drive and turn: what was asked for, what was achieved, the gap, the time taken, and whether it **settled** or hit its **timeout**. Click a row to jump the timeline there.
- **Contact.** The robot stops against walls, goals and loaders, and its encoders stop with it — so a blocked drive burns its whole timeout going nowhere, just as on the field. A square hit squares the robot up. An oblique or corner hit is genuinely unpredictable, so the simulation **stops and says so** rather than drawing a confident wrong path.
- **Intake.** A faint capture wedge while collecting; blocks it passes over leave the field and count as carried. With the `matchload` plate deployed against a loader, the stack is drawn down from the bottom and the rest fall.
- **Placement.** Drag and rotate the start pose anywhere, snap to half tiles or 15°, and save named placements per routine. Our routines use only gyro-relative headings, so the same code can be tried from any corner.
- **Measuring.** Edge rulers, a straight-edge to line the robot up against, and persistent measurement lines in inches, tiles and bearing — the bearing in the robot's own heading convention, so a measured angle can be typed straight into `turn_to_angle()`.
- **Total time**, front and centre, against the 15 s autonomous period.

---

## Quick start (Windows)

1. Install [w64devkit](https://github.com/skeeto/w64devkit/releases) — a single zip, no installer. If you unpack it anywhere other than `D:\w64devkit`, edit the `DEVKIT` line at the top of [`build.bat`](build.bat).
2. Clone this repository.
3. Run:
   ```bat
   .\build.bat
   ```
   This compiles every routine and writes `out/logs.js`.
4. Open [`viewer/index.html`](viewer/index.html) in a browser. No server is needed.

To iterate, leave `.\watch.bat` running: edit and save `autons.cpp`, then press **F5**.

`build.bat` first looks for our live VEXcode project on my Desktop and syncs a copy into `reference/`, so every commit records exactly how the routines changed. On any other machine it falls back to that copy automatically.

---

## Where things are

```
build.bat              compile + run every routine; syncs reference/ from the live VEXcode project
watch.bat              rebuild on save

mock/                  THE MOCK VEX SDK — what the linker substitutes on a laptop
  vex.h                  fake motor, digital_out, inertial, timer, wait(), enums
  drive.h, drive.cpp     Drive class with the template's exact signatures; records, never drives
  devices.cpp            the device list and the simulated clock
  recorder.h, .cpp       the action log, written as JSON
harness/
  main_sim.cpp           replaces main.cpp: builds the chassis, runs routines, writes out/

viewer/                THE SIMULATOR AND VIEWER — open index.html
  robot.js               robot geometry and the three drivetrain constants: edit here
  sim.js                 PID.cpp and the move loops, transcribed; the intake model
  collide.js             contact with walls, goals and loaders
  field.js               Push Back field geometry and block layout, from the official drawings
  viewer.js              camera, timeline, placement, tools, warnings

out/                   generated action logs; logs.js is what the viewer loads
reference/             snapshot of our VEXcode project (see ATTRIBUTION.md)
docs/
  FINDINGS.md            what building this turned up about our code and the template
  architecture.svg       the diagram above
NOTES-future.md        deferred work, and what each item would actually need
```

---

## What it found

Building the simulator meant reading our control template line by line. The full write-up is in **[docs/FINDINGS.md](docs/FINDINGS.md)**. The short version:

- **Every drive exits on timeout.** `drive_settle_error = 0` makes the settle branch of `PID::is_settled()` unreachable, so `drive_timeout` — not the distance argument — decides how far each move gets.
- **It could not have settled anyway.** The drive loop's integral is disabled and `kd = 0`, so it is pure proportional control, which has an unavoidable steady-state error. A 1 in settle band would still never fire.
- **That was a trade, not a bug.** Timeout-driven moves are inaccurate but repeatable, and they make the 15 s time budget exact. On a known field, that trade pays.
- **Turn radius has a closed form.** With both loops saturated, `R = track × drive_max_v / (2 × heading_max_v)` — the ratio we had been tuning by feel.
- **A blocked robot's encoders stop.** So its distance PID sees no progress and runs out its whole timeout. The simulator reproduces this without special-casing it.

---

## The model, and what it does not claim

A simulator is only useful if it is honest about where it is guessing.

- **The drivetrain model has exactly three constants** — load factor, response time constant and dead-band voltage — in [`viewer/robot.js`](viewer/robot.js), adjustable live in the viewer. They are estimated, not yet measured. Structural conclusions ("this drive times out", "this reverse move falls 8 in short") hold across any reasonable values; the exact inches depend on calibration.
- **The intake model reports geometry, not success.** It says which blocks passed through the capture zone. It does not claim the robot got them, because approach angle and roller grip are not modelled. Its most useful output is the opposite finding: the wedge sweeping empty floor means the path missed.
- **Oblique impacts are not simulated past the impact.** The path ends there, with a warning.
- **Field positions are marked by confidence** in [`viewer/field.js`](viewer/field.js): groups confirmed against the reference drawing's tick marks, versus groups placed from the official render.

---

## Authorship and credits

**I (Rogercy-whoop, team 117V) led this project.** I identified the problem and specified the architecture — a mock hardware layer at the linker seam, with no C++ parsing. I wrote every autonomous routine it simulates, along with our intake helpers and driver control. The findings about the control template began with my own line-by-line investigation of it, before this project started. The robot knowledge in the model is mine — dimensions, intake and plate geometry, the descore hook, loader contents — and I confirmed every calibration against how our robot actually behaves. I checked each stage against the robot and the official drawings, and caught the errors that mattered, including the heading-frame bug that made the simulated path diverge from the code.

**The code in `mock/`, `harness/` and `viewer/` was written with Claude, Anthropic's AI coding assistant, under my direction:** I set the requirements, and reviewed and corrected each stage. Later commits carry a `Co-Authored-By` trailer; the earliest commits were made the same way but predate it.

**The control template is not mine.** The files under `reference/…/auto-Template/` — `drive.cpp`, `PID.cpp`, `odom.cpp`, `util.cpp` and their headers — were supplied by our coach and closely resemble the public JAR Template. They are included only so the mock can be checked against the interface it imitates. [ATTRIBUTION.md](ATTRIBUTION.md) breaks this down file by file.

Field dimensions come from the public VEX 2025–26 V5RC *Push Back* field specification drawings. The field is drawn from those measurements; no VEX artwork is redistributed.

---

## Roadmap

In rough order. Details, and what each item actually needs, are in [NOTES-future.md](NOTES-future.md).

1. **Calibrate against the real field.** Measure the three drivetrain constants and the intake rates. Items 5 and 6 depend on this.
2. **Click a move, see its line of code.** Capture each command's source location at compile time.
3. **Open it to every team in our school's club.** Same coach and template, so the mock is shared; each team supplies a small robot profile.
4. **Compile and edit in the browser.** Drag in `autons.cpp`, edit it on the page, re-simulate, save it back — nothing to install.
5. **Scoring prediction**, from measured intake and alignment tolerances.
6. **Route optimisation**, using the calibrated simulator as the objective function.
