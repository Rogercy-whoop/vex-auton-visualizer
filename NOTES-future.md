# What comes next

Everything here was raised during the build and deliberately deferred. Each
entry says what it would actually need, because "add physics later" is not a
plan, and this list should still be usable in six months.

In rough order of value against effort.

---

## 1. Calibrate against a real field

The simulator has three physical constants that were never measured — load
factor, response time constant, dead band — plus two intake rates set from
observed behaviour rather than measured. Everything quantitative downstream
(scoring prediction, route optimisation) is only as good as these.

*Needs:* one session on a field with a tape measure. For each constant, one
run whose result depends mostly on it:

| constant | run | measure |
|---|---|---|
| load factor | `drive_distance(60, 0, 12, 12)` with a long timeout | distance covered in the first second |
| response time | the same run, filmed | time to reach steady speed |
| dead band | raise voltage 0.1 V at a time from rest | the voltage at which it first moves |
| loader rate | intake at a loader for 0.5 / 1.0 / 1.5 s | blocks drawn each time |

Then adjust the sliders until the simulator reproduces each run, and record
the before-and-after error. Predict, measure, correct: this is the step that
turns the tool from a visualiser into a model.

*Timing:* the Push Back field is down for the new season, so this waits for
the next game's field. The drivetrain constants carry over; the field does not.

---

## 2. Edit in the browser — "plan C"

Today a team edits in VEXcode, rebuilds on a laptop with a compiler, and
refreshes. The goal: open a web page, drop in a VEXcode project, edit a number
on the page, re-simulate, save it back — with nothing installed.

*Needs:*
1. **A C++ compiler that runs in the browser** — clang built for WebAssembly.
   Several builds exist; the first job is a half-day spike to find one that
   compiles our mock and the C++ standard library headers. First load is large
   (tens of MB), so it should be fetched only when someone clicks *Compile*.
2. **An in-browser file system** holding the mock, the template headers and
   the dropped project, so `#include` resolves as it does on disk.
3. **Symbol-table discovery in the browser** — the routine and device lists
   currently come from `nm`; the WebAssembly toolchain needs an equivalent, or
   the compiled module has to expose them.
4. **An editor** — CodeMirror, lightweight and readable — replacing the
   read-only code panel.
5. **Saving back** with the browser's File System Access API (Chrome and
   Edge), which can write straight into the team's `autons.cpp` once they have
   picked it. Needs the page to be served over HTTPS — GitHub Pages.

*Estimate:* half a day to prove it is feasible, then 12–18 hours.

---

## 3. Small, useful now

- **Warn when a pneumatic is opened and never closed.** `descore.set(true)`
  appears in `skillszuo` and `superzuo` with no matching `false`. `main.cpp`
  resets it before the next autonomous, but running an auton from driver
  control leaves it out. A static check over the action log.
- **Open another team's results on the hosted page.** Let the GitHub Pages
  viewer load a `-Package` folder the user picks, so a team can view their
  results at the demo address without unzipping anything.
- **Start pose from the code.** A routine that calls `set_coordinates(x, y, h)`
  states its own start position; offer it as a placement.

---

## 4. Scoring prediction

Whether ejected blocks actually land in a goal.

*Needs:* measurements, not modelling. With the robot at a goal, eject from
offsets of 0 / 1 / 2 / 3 in and angles of 0 / 5 / 10°, five times each, and
count what scores. That gives an alignment tolerance; the simulator already
knows where the robot is when `intake_high()` runs, so the prediction is a
lookup against that table. Goal capacity comes from geometry (a long goal
holds about fifteen blocks end to end).

---

## 5. Route optimisation

Given a routine, find better values for its numbers — distances, headings,
voltages, timeouts — that make it faster while still arriving where it should.

*Needs:*
- the simulator as the **objective function**: it already runs a routine in
  10–40 ms, so thousands of candidates can be tried in a minute in the browser
- an objective: total time, plus penalties for missing a target by more than
  2 in, for oblique contact, and for running past 15 s
- a search method — coordinate descent to start, CMA-ES if that stalls in
  local minima
- output as **suggested edits to `autons.cpp`**, line by line, which the code
  panel can already point at

*Prerequisite:* calibration (item 1). Optimising against an uncalibrated model
gives a precise answer to the wrong question.

A natural layer on top: a language model that explains the optimiser's
suggestions in plain terms. It needs an API key, which cannot be embedded in a
public page — each user would supply their own, or a small server would hold
it.

Planning a route from a list of tasks ("collect these three, score in the long
goal, park") is a separate and much harder problem: it needs a planner that
emits drive/turn sequences, not just a tuner. Worth doing only after
optimisation works.

---

## 6. Odometry

`drive_to_point()` and `turn_to_point()` steer by odometry, so routines that
use them currently stop at that line.

*Needs:* transcribe `odom.cpp`'s arc integration and the point-to-point loops
from `drive.cpp`, fed by the simulated encoders and gyro. Straightforward —
the template's code is already understood (see FINDINGS, lessons 4 and 5) —
but only worth doing once a team actually uses these calls.

---

## 7. Mechanisms

Each needs a measured rate, not artwork.

- **Descoring.** The L-shaped hook on our robot's upper left drops into a
  goal's top slot and pushes blocks out the far side. The slot is drawn, and a
  move can be marked as an intended hook engagement; what is missing is how
  many blocks shift per inch of insertion.
- **Intake throughput** as a function of voltage — the one number here that
  cannot be derived from code at all.

---

## 8. Things the model deliberately leaves out

- **Sensors the path depends on** (distance, optical). A stub would return a
  fake reading and the simulation would be silently wrong, so they are not
  stubbed; a routine that waits on one is stopped after three minutes.
- **Other robots.** No interaction model.
- **Other games.** The field is Push Back. The recorder and simulator are
  game-independent; a new season needs a new `field.js`.

---

## Field detail still approximate

- The four three-block clusters near the centre goal and the loader contents
  are placed from the official render, not from tick marks. The long-goal,
  park-zone and corner groups are confirmed by the 3.23 in block pitch.
- Centre goal arm length reads 22.60 in as the full tip-to-tip span, which puts
  the tips exactly on the drawing's 62.22 / 78.19 ticks.
