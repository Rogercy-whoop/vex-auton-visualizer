# Findings

What building this simulator turned up — about the control template, about the
robot, and about the design decisions the project forced. Written for me, as
material I have to be able to defend out loud.

Each entry is: what I found, how I found it, and why it matters.

---

## 1. The architecture: substitution at the linker, not a parser

**The idea.** `autons.cpp` is compiled unmodified on a laptop. Nothing parses
or interprets the C++.

**Why it works.** When g++ compiles a call to `drive_distance`, it only needs
the *signature* — name, parameter types, return type. It emits a placeholder
and trusts the linker to supply a body. On the V5 brain the linker supplies
`drive.cpp`, which spins motors. On my laptop it supplies `mock/drive.cpp`,
which writes JSON. `autons.cpp` cannot tell the difference and never changes.

**Why it matters.** The file I test is byte-for-byte the file I upload. A
parser or a copy-paste box would create a second version that drifts from the
real one — the exact failure this tool exists to prevent. The technique has a
name (link-time substitution / a mocked hardware abstraction layer) and it is
how embedded firmware is unit-tested in industry.

> **Defend it:** why does the compiler not need the function body, and what
> exactly does the linker check?

---

## 2. Every `drive_distance` exits on timeout, not on arrival

**The chain**, all three files:

```
autons.cpp:17   set_drive_exit_conditions(0, 180, 900)   // settle_error = 0
PID.cpp:33      if (fabs(error) < settle_error) ...      // |x| < 0 is never true
PID.cpp:49      if (time_spent_settled > settle_time)    // 0 > 180, never
PID.cpp:46      if (time_spent_running > timeout)        // the only way out
```

So the distance argument is not "how far to go" — it is a target handed to a
PID that will be cut off by the clock regardless. **`drive_timeout` is the
variable that actually sets the distance.**

Turns are different: `turn_settle_error = 1`, so they genuinely converge and
usually exit early.

**Evidence in my own code.** `autons.cpp` is full of `chassis.drive_timeout =
700; / = 1600;` adjustments before individual moves. I had been tuning by time
for two seasons without knowing that was the only mechanism available.

---

## 3. The deeper reason: the settle branch could never have fired anyway

This one came out of connecting two separate findings.

The drive loop's integral gain is dead (`starti = 0`, so
`if (fabs(error) < starti)` never accumulates) and `kd = 0`. The drive loop is
therefore **pure proportional**.

Pure P control has an unavoidable steady-state error. The robot only moves
while `kp × error` exceeds the voltage needed to overcome static friction and
the motor dead band:

```
e_steady = V_dead / kp = V_dead / 0.7
```

For a V_dead around 1.5 V that is roughly 2 in. So a `settle_error` of 1 in —
the value the turn loop uses — **would also never have fired**. It would have
produced the same timeout behaviour, just less visibly.

**Making the drive converge needs one of two things**, not a tweak:
widen `settle_error` past the steady-state error, or enable the integral
(`starti` non-zero), which is what an integral term is *for*.

---

## 4. So `settle_error = 0` is a trade, not a mistake

Given that convergence was unreachable, setting the band to zero says: stop
pretending, make the behaviour fully predictable. That buys two real things:

- **Repeatability.** A timeout-driven move runs the same duration at the same
  voltages every time, so it travels the same distance every time on the same
  field. Inaccurate, but *stable* — and on a known field, stable beats accurate.
- **Time determinism.** In a 15-second autonomous, every move's duration is
  known and sums exactly. Convergence-based exits have variable duration and
  cannot be budgeted.

> **The honest one-liner:** *I traded accuracy for repeatability and a
> predictable time budget. On a known field that trade pays; on an unfamiliar
> one it does not, because repeatability locks in the motion, not the position.*

---

## 5. The heading voltage is an authority-allocation decision, and it has a formula

`drive_distance(d, h, dv, hv)` runs a distance PID and a heading PID at once
and superimposes them: `left = drive + heading`, `right = drive − heading`.
`dv` and `hv` clamp the two loops separately.

At the start of any large move both loops saturate, and then:

```
forward speed  v  ∝ dv
turn rate      ω  ∝ hv / track_width
turn radius    R  = track × dv / (2 × hv)
```

With a 12 in track, my own calls come out as:

| call | dv | hv | R |
|---|---|---|---|
| `drive_distance(-30/2.54, -45, 10, 1.5)` | 10 | 1.5 | 40 in — a wide, gentle arc |
| `drive_distance(30/2.54, -135, 9, 4)` | 9 | 4 | 13.5 in |
| `drive_distance(45/2.54, -32, 6, 6)` | 6 | 6 | 6 in — almost a pivot |

**What the shape of the arc depends on is the ratio `dv : hv`, not either
value alone.** I had been varying it by feel for two seasons; it has a name
(authority allocation) and a closed form.

---

## 6. The odometry was configured and never switched on

`main.cpp` passes `ZERO_TRACKER_ODOM`, but the tracking task only starts inside
`set_coordinates()`, which nothing ever calls. `get_X_position()` returns 0
forever, so `drive_to_point()` and `turn_to_point()` could not have worked.

This is also why the simulator can place the robot anywhere: the routines use
**no absolute position at all**, only gyro-relative headings. A thing that
looks like a defect turns out to be what makes "run this same routine from a
different corner" a one-drag operation.

---

## 7. dt is not missing from the PID — it is absorbed into the gains

`PID::compute` has no `dt`: the integral is a bare sum and the derivative a
bare difference. That is legal only because every control loop ends with
`task::sleep(10)`, fixing dt at 10 ms. Discretising the textbook form gives

```
ki_code = Ki · dt        kd_code = Kd / dt
```

So a tuned `turn kd = 3.8` corresponds to a "true" Kd of 0.038. If the loop
period ever changed to 20 ms, every gain would silently be wrong: halve each
ki, double each kd. Three places hard-code the 10 ms assumption.

---

## 8. A blocked robot's encoders stop, and that is why it burns the whole timeout

This fell out of adding collision to the simulator, and it is the finding I did
not expect.

When the robot is pressed against a goal or wall, a VEX drive stalls rather
than slipping — the wheels barely turn, so the **encoders barely count**. The
distance PID therefore sees no progress at all, holds full commanded voltage,
and exits on its timeout having travelled nothing.

In the simulator this is not special-cased. The encoders are integrated from
the motion that *actually happened* after collision resolution, so the
behaviour emerges. That is the test of whether a model is right: the
interesting consequence should fall out, not be written in.

**Why it matters for the tool:** without collision, a simulation reports where
the wheels would have carried the robot. After the first contact, everything
downstream is fiction — not slightly optimistic, *wrong*, because each move
starts from where the last one ended.

---

## 9. Where the simulator refuses to answer

A square impact is predictable: the reaction squares the robot up, which is the
familiar "drive into the wall to straighten out" trick. An oblique or corner
impact is not — the outcome depends on friction, on which corner caught, on how
the frame flexes.

So the simulator classifies the contact and, when it is oblique, **stops and
says so** rather than drawing a confident line. Showing the path up to the
impact is useful; inventing what happens after it is worse than useless,
because the picture looks just as authoritative either way.

The same rule decided the intake: a capture wedge showing where the robot is
*trying* to collect is honest; a block-pickup animation asserting what it
*caught* would be a guess wearing a uniform.

---

## 10. Two rendering decisions that are really measurement decisions

**Orthographic geometry, shaded depth.** The official field render leans tall
objects outward slightly — real perspective. Copying that would make "which
tile is this block on" ambiguous. So footprints are drawn at exact positions
and every tall object's *top* leans outward by an amount proportional to its
height. The picture reads as three-dimensional; the floor contact — the thing a
robot can hit — never moves.

**Recorder and simulator are separate.** The C++ mock only records what the
code asked for. All the dynamics live in JavaScript. That split means the
physics model can be re-tuned with a slider instead of a recompile, and the
recorder stays about 150 lines that are nearly impossible to get wrong.

---

## 11. One browser rule shaped the whole data path

A page opened with `file://` may not `fetch()` a local file, but it may load a
`<script>`. So the harness emits `out/logs.js` assigning
`window.VEXSIM_LOGS = {...}` alongside the plain `.json`. That single
constraint is why the tool needs no web server at all — double-clicking the
HTML is enough.

---

## Open threads

1. **Calibrate the drivetrain model.** It has exactly three constants (load
   factor, response time constant, dead-band voltage). One measurement on a
   real field — how far does `drive_distance(50, 0, 9, 9)` with a 1600 ms
   timeout actually travel — pins them down. Structural conclusions ("every
   drive times out", "these two reverse moves do not finish") do not depend on
   the constants; the exact inches do.
2. **Measure `V_dead` directly** and compute the smallest `settle_error` that
   could ever fire.
3. **Turn the integral on** (`starti` non-zero) and find out whether the
   routines can move to genuine convergence exits.
4. **Run the odometry** — call `set_coordinates()`, start the task, and see how
   far `ZERO_TRACKER_ODOM` drifts across a match without tracking wheels.
5. **Intake throughput** — blocks per second as a function of voltage. The one
   number on the list that cannot be derived from the code and has to be
   measured.
