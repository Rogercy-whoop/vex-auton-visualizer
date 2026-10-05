# Build log

How this project was built, in order, with the screenshots taken along the
way. Dates are the commit dates in this repository's history, which GitHub
shows under **Commits**.

---

## 17 Aug 2026 — the repository

![The first commits](media/2026-08-commit-history.png)

The repository was created before any code, so the history would start at the
beginning. The first decision on record is in the second commit: the
teacher-supplied control template was excluded from publication until it was
clear how to credit it (it was later published with a file-by-file
[attribution](../ATTRIBUTION.md)).

![The repository after the first push](media/2026-08-repo-first-push.png)

---

## 26 Aug — the seam: unmodified code compiles on a laptop

![The first clean compile](media/phase1-first-clean-compile.png)

The technically hardest step, and the least impressive-looking one. Our
`autons.cpp`, **unchanged**, compiled against a stand-in for the VEX SDK and ran
on a laptop. The `time:15.2` line is printed by our own code — a timing line we
wrote years ago for the robot's screen, now reporting simulated time.

The same day: the first drawing of the Push Back field, built from the official
field drawings rather than an image.

---

## 19 Sep — the control loop, collision, and the intake

The template's PID loop was transcribed line for line and run at 10 ms, so the
path shows what the robot *does* with the timeouts as written, not what the
code intends. Then collision: the robot can no longer drive through a goal,
and its encoders stop when it is blocked.

![Refusing to guess after an oblique impact](media/oblique-contact-refusal.png)

When the robot hits something at an angle, what happens next depends on
friction and on which corner caught — so the simulator stops there and says
so, rather than drawing a confident wrong path. Placed in the wrong corner,
`zuo` drives into the centre goal 1.34 s in.

A bug worth recording: after collision was added, the simulated path and the
intended path diverged by exactly the start orientation. The routines speak in
**gyro** headings, which read 0 wherever the robot was placed; the geometry
needs **field** headings. The fix converts between them in one place, and a
regression test now checks that a routine run from 0° and from 90° produces
paths that are exact rotations of each other.

![Naming a start placement](media/naming-a-placement.png)

Start placements can be named and saved per routine.

![lanyou, simulated](media/lanyou-before-code-panel.png)

`lanyou` with its placement saved, before the code panel existed.

---

## 26 Sep — for every team in the club

- **Click a move, see its line of code.** Each recorded action now carries the
  file and line that made it, filled in by the compiler through a default
  argument. `autons.cpp` is still not edited.
- **Other teams' projects compile unchanged.** Only three files are swapped for
  stand-ins; routines and device names are read from the compiled object
  files' symbol tables. A team fills in a [robot profile](../profiles/README.md)
  and nothing else.
- README, the [architecture diagram](architecture.svg), and an accurate
  [attribution](../ATTRIBUTION.md).

![The viewer with the code panel open](media/viewer.png)

---

## 27 Sep — every team in the club

The other three teams in SFLS's robotics club, 11117V, 116X-323 and 3778W, sent
their VEXcode project folders. Each was built with `-Package`, so their code
stays out of this repository. Each team gets a folder of its own results that
opens in a browser.

| team | routines found | result |
|---|---|---|
| 11117V | `test`, `zuo`, `you0plus4`, `you0plus7` | compiled and ran unchanged |
| 116X-323 | `zuo`, `you0plus4`, `you0plus7` | compiled and ran unchanged |
| 3778W | `zuo`, `you0plus4`, `you0plus7` | compiled and ran unchanged; routines shared with 11117V, on different ports |

- **All three compiled and ran unchanged, first time.** No edits to their
  projects and none to the simulator. Each gave thirteen devices from its
  symbol table.
- **The first drives that finish by arriving.** 116X-323 tuned their own
  constants: a drive settle error of 0.6 in with the integral switched on,
  where ours is 0 with the integral off. So some of their drives now end by
  settling, not on the timeout. Until now that branch of `PID::is_settled()`
  had only ever run on turns.
- **A cross-check from their own code.** Two of 11117V's routines print their
  elapsed time with their own timer (`autons.cpp:98`, `:184`). In simulation
  they printed `14.4` and `12.2`, matching the recorder's 14400 ms and
  12200 ms. Their timer reads the simulated clock the stand-ins advance, so this
  confirms the clock is consistent, not that the times are physically right.
- **What the profile was for.** All three teams' `intake_hold()` spins the
  shooter backwards at 10% while collecting, where ours stops it. So 117V's intake rule
  would not have recognised it. Their profiles say
  `"collect_when": { "intake": "reverse", "shooter": "reverse" }` and the
  intake model picked it up. This is a difference in the robot, handled in data
  rather than code, which is the case the profile was designed for.
- **A bug it caught.** The blank profile, `profiles/TEMPLATE.json`, still had
  the old dead band of 1.0 V, which makes every turn time out. It is now 0.6,
  matching the default.
- **Still provisional:** each team's robot dimensions and intake geometry, and
  each routine's start placement, until the teams supply them.

**In use.** Each team was sent its folder, and by early October all three had
opened their own results. So every team in the club now uses it.

*Evidence (to be added):*

- *(photo)* — 11117V with their results open
- *(photo)* — 116X-323 with their results open
- *(photo)* — 3778W with their results open
- *(screenshot)* — the three build outputs listing each team's routines

---

## Videos

Screen recordings are too large to keep in the repository. They are linked
here instead:

- *(link)* — the old testing loop: edit, upload, walk to the field, reset every
  block, run, fail
- *(link)* — switching routines: the path drawing itself after each simulation
- *(link)* — dragging the start placement and watching the path recompute
- *(link)* — `lanyou` at the loader: the plate deploys, the stack is drawn down
  and falls, the count climbs to six
