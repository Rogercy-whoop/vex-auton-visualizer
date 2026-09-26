# Robot profiles

A robot profile is the **only** thing a team fills in to use the simulator.
Everything else — PID gains, timeouts, wheel size, gearing, motor cartridge,
device names, the list of routines — is read from the team's own code.

A profile holds what the code *cannot* say: how big the robot is, how its
intake is shaped, and which motor combination means "collecting".

- [`117V.json`](117V.json) — ours, as a worked example
- [`TEMPLATE.json`](TEMPLATE.json) — copy this to start

Save your copy as **`vexsim-profile.json` in your VEXcode project folder** (next
to `src\` and `include\`) and the build picks it up automatically. Or pass it
explicitly with `-Profile`.

All distances are inches, all times milliseconds.

---

## Footprint

| field | meaning | how to get it |
|---|---|---|
| `length_in` | front to back, **bumpers included** | tape measure — this is what hits walls and goals |
| `width_in` | side to side, bumpers included | tape measure |
| `track_in` | centre of the left wheels to centre of the right wheels | tape measure; sets how sharply the robot turns |
| `center_offset_in` | how far the turning centre sits forward of the middle of the robot | usually `0` for a symmetric tank drive |

## `intake`

| field | meaning |
|---|---|
| `width_in` | width of the rollers at the front |
| `reach_in` | how far in front of the robot a block can be and still be caught (about 1.5 blocks is typical) |
| `side_deg` | how much the capture zone widens at each side |
| `capacity` | how many blocks the robot can hold at once |
| `release_ms` | time to eject one block |
| `collect_when` | the motor states that mean **collecting** |
| `eject_when` | the motor states that mean **ejecting** |

`collect_when` and `eject_when` use **your own device names** from
`robot-config.cpp`. Each listed motor must be in the given state:

- `"fwd"` — spinning forward
- `"reverse"` — spinning in reverse
- `"stop"` — stopped
- `"spin"` — spinning either way

Read them straight off your intake helper functions. Ours, from
`autofunction.cpp`:

```cpp
void intake_hold(int speed) { intake.spin(reverse, speed, pct); shooter.stop(); }          // collecting
void intake_high(int speed) { intake.spin(reverse, speed, pct); shooter.spin(forward, ...); } // ejecting
```

becomes

```json
"collect_when": { "intake": "reverse", "shooter": "stop" },
"eject_when":   { "intake": "reverse", "shooter": "fwd" }
```

A single-motor intake is simpler still:

```json
"collect_when": { "roller": "fwd" },
"eject_when":   { "roller": "reverse" }
```

## `plate`

For robots that draw blocks out of a loader with a deployable plate. Leave
`pneumatic` empty (`""`) if yours does not.

| field | meaning |
|---|---|
| `pneumatic` | the `digital_out` that deploys it, by its name in `robot-config.cpp` |
| `reach_in` | how far it sticks out past the front of the robot |
| `collides` | `false` if it sits low enough to slide under a loader tube |
| `loader_ms` | time to draw one block down out of a loader |

## `sim` — the drivetrain model

The only physics in the simulator. Leave these at the defaults unless you have
measured your robot.

| field | meaning |
|---|---|
| `load_factor` | fraction of free speed the robot reaches carrying its own weight |
| `tau_s` | how quickly it gets up to speed (time constant, seconds) |
| `v_dead` | the voltage below which the drive does not move at all |

The robot's free speed is **not** in the profile: it is worked out from the
motor cartridge, gear ratio and wheel diameter in your `main.cpp`.

---

## What the simulator cannot handle yet

- **`drive_to_point()` / `turn_to_point()`** steer by odometry, which is not
  simulated. A routine that uses them is shown up to that line and stops with
  a note saying why.
- **Sensors the path depends on** — distance sensors, optical sensors — are not
  simulated. Nothing in the simulation ever changes a sensor reading, so a
  `waitUntil()` on one never finishes; the build stops such a routine after
  three minutes of simulated time and says so.
