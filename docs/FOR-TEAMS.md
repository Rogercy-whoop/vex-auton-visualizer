# Using this with another team's robot

Every team in our club uses the same competition template from the same coach,
so the simulator's stand-in for the template works for all of them without
changes. What differs from robot to robot is either **already in each team's
code** — PID gains, timeouts, wheel size, gearing, device names — and is read
from it automatically, or it goes in a **[robot profile](../profiles/README.md)**:
a short form describing the robot's size and intake.

No team writes any simulator code.

---

## What happens to a team's project

The build compiles the team's **whole VEXcode project, unchanged**, except for
three files it swaps for stand-ins:

| file | replaced by | why |
|---|---|---|
| `include/vex.h` | [`mock/vex.h`](../mock/vex.h) | the real one only compiles for the V5 brain |
| `include/auto-Template/drive.h` | [`mock/auto-Template/drive.h`](../mock/auto-Template/drive.h) | same signatures, so the team's calls still compile |
| `src/auto-Template/drive.cpp` | [`mock/drive.cpp`](../mock/drive.cpp) | records each move instead of driving motors |

Everything else — `autons.cpp`, `robot-config.cpp`, `main.cpp`, the team's own
helpers, and the rest of the template — is their real code. Then:

- **the list of routines** is read from the compiled `autons.o`'s symbol table
  (every global function taking no arguments)
- **each device's name** is read from `robot-config.o`'s symbol table
- **the chassis** — wheel size, gear ratio, motor cartridge — comes from the
  `Drive chassis(...)` line in the team's own `main.cpp`

Nothing is found by reading source code as text.

---

## Three ways a team can use it

### 1. Run it themselves

Needs a Windows laptop and about ten minutes, once.

1. Download this repository (**Code → Download ZIP** on GitHub) and unzip it.
2. Install [w64devkit](https://github.com/skeeto/w64devkit/releases) — one zip,
   no installer. Note where its `bin` folder ends up.
3. Copy [`profiles/TEMPLATE.json`](../profiles/TEMPLATE.json) into your VEXcode
   project folder, rename it `vexsim-profile.json`, and fill it in using
   [the profile guide](../profiles/README.md).
4. In the unzipped folder, run:
   ```bat
   .\build.bat -Project "D:\path\to\your\VEXcode\project" -DevKit "D:\w64devkit\bin"
   ```
5. Open `viewer\index.html`.

To iterate, run `.\watch.bat` with the same arguments, edit in VEXcode, save,
and press F5 in the browser.

### 2. Through one person with the toolchain

The team sends their project folder (zipped). Whoever has the toolchain set up
runs:

```bat
.\build.bat -Project "D:\teams\TeamX" -Package "D:\teams\TeamX-viewer"
```

and sends back the `TeamX-viewer` folder, zipped. The team opens
`viewer\index.html` inside it — nothing to install.

**Always use `-Package` for someone else's project.** Without it the results
go into this repository's `out\` folder, which is published — and another
team's code should not be published without their say-so. The build prints a
warning if you forget.

### 3. Share a particular view

Every view has a link: **Copy link to this view** in the sidebar captures the
routine, the start placement, the moment on the timeline and the open code
file. Nothing is uploaded; it is all in the address.

On the hosted copy (GitHub Pages) the link works for anyone — send it and they
land on exactly that frame. From a copy opened on your own disk it is a
`file:///` address, so it only works on the same computer.

---

## Checking a new team's build

The first build for a new team is worth reading carefully. It prints:

```
  [2/3] reading symbol tables
        routines  test, zuo, superzuo, skillszuo, lanyou, superyou
        devices   Brain, Controller1, descore, Gyro, intake, leftA, ...
```

- If a routine is missing, it probably takes arguments — only functions of the
  form `void name()` in `autons.cpp` count as routines.
- If the build stops with *"a device defined in robot-config.cpp is not declared
  in robot-config.h"*, add the missing `extern` line to `robot-config.h`. VEXcode
  normally writes both files together, so this only happens after hand-editing.
- If a routine prints `STOPPED: ran past 3 min`, it waits on a sensor
  (`waitUntil(...)`), which never changes in simulation.

Then open the viewer and check one routine against what the robot is known to
do on the field before trusting the rest.
