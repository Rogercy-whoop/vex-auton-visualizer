# Future work — parked deliberately, not forgotten

Everything here was raised during the build and consciously deferred so that
V1 (path visualisation) ships first. Each entry says what it needs, because
"add physics later" is not a plan and this list is meant to still be usable
in six months.

---

## Near term — small, do these once the path renders

### Blocks disappear when the intake sweeps them
When the intake wedge passes over a block, fade the block out and mark it
carried. Purely visual bookkeeping — no physics — but it removes the
nonsense of the robot rectangle overlapping a block that is supposedly
inside it.

*Needs:* the intake wedge geometry (already parameterised), plus a
"carried" set threaded through `drawField`'s `hidden` argument, which is
already there for exactly this.

### Robot rear detail
Draw the back of the robot, not just a front marker. The chassis is not
symmetric and several routines reverse into scoring positions, so which end
is which matters when reading a path.

### Warning: pneumatic opened but never closed
`descore.set(true)` appears in `skillszuo` and `superzuo` and is never set
back to false. `main.cpp:45` covers it at the start of the next autonomous,
but running an auton from driver control would leave it extended. Easy
static check over the action log.

---

## Medium term — the PID simulation (V1.5)

Replace the ideal "the move reaches its target" model with the real control
loop, run at the same 10 ms tick as the robot.

*Needs:* the PID equation from `PID.cpp:29` (already in the log, per-move),
plus one physical constant — the voltage-to-speed factor. That can be
derived rather than guessed: 600 rpm cartridge × 0.75 gear ratio ×
π × 3.25 in = **76.6 in/s free speed at 12 V**.

*Pays for:* the single most valuable output of the whole tool —
**ideal endpoint vs timeout endpoint**. With `drive_settle_error = 0`,
every drive exits on timeout, so that gap is systematic. Flag any move
where it exceeds ~2 in.

*Also answers, without touching the robot:*
- the steady-state error of the pure-P drive loop, hence the smallest
  `settle_error` that could ever fire
- whether enabling the integral (`starti` non-zero) would let the routines
  switch to genuine convergence exits

Those two are open threads 4 and 5 from the study notes.

---

## Longer term — mechanism modelling

Each of these needs a maths model, not just artwork. Listed with what the
model would actually have to contain.

### Descoring at the long goals
The robot carries an aluminium bar on its upper left that inserts into a
long goal and pushes blocks out the far side.

*Needs:* bar reach and height, insertion geometry, and a rule for how many
blocks shift per inch of insertion. Without a measured push rate this is
animation, not simulation.

### Loader intake
A pneumatic PC plate drops, slides under the loader tube, and the intake
draws blocks down.

*Needs:* plate deployment geometry, the alignment tolerance that makes the
difference between catching the tube and missing it, and an intake rate.

### Intake throughput
"How many blocks can this intake actually collect in the time available, at
this voltage?"

*Needs:* a rate model — blocks per second as a function of intake voltage —
which has to be measured on the real robot. This is the one entry here that
cannot be derived from the code at all.

### Obstacle interaction
What happens when the robot meets a wall, a goal, or another robot.

*Needs:* collision geometry plus a decision about behaviour on contact.
Worth noting that this interacts with the timeout finding: a blocked robot
still burns its full timeout and the routine still marches on, so a
collision model would make the timeline meaningfully wrong in a way the
current one is not.

---

## Field detail

- Tile interlocking teeth at the seams, drawn at high zoom only.
- Verify the estimated block groups against the official drawing: the
  four three-block clusters near the centre goal, and the loader contents.
  The long-goal and park-zone groups are already confirmed by tick spacing.

---

## Added 2026-09-19 — deferred from the collision/rendering pass

### Community contribution: letting other teams upload their routines
The endgame for this project. Needs an architectural decision first; see the
options discussed in the session. The constraint that makes it hard is that
compiling C++ requires a compiler, and the project has deliberately never had
a backend.

### Mechanism modelling, in the order it would pay off
1. **Blocks disappear when the intake wedge sweeps them.** Visual bookkeeping
   only; the `hidden` argument to `drawField` already exists for it.
2. **Descore bar.** The L-shaped aluminium hook on the robot's upper left
   inserts into a goal's top slot and pushes blocks out the far side. The slot
   is now drawn on both the long goals and the centre goal, and a move can be
   marked as an intended hook engagement in the moves table. What is missing is
   a rule for how many blocks shift per inch of insertion — that has to be
   measured.
3. **Loader intake.** A pneumatic PC plate drops, slides under the tube, and
   the intake draws blocks down. Needs plate geometry and, critically, the
   alignment tolerance that separates catching the tube from missing it.
4. **Intake throughput.** Blocks per second against intake voltage. The only
   item on this list that cannot be derived from the code at all.

### Field detail still approximate
- The four three-block clusters near the centre goal and the loader contents
  are placed from the official render, not from tick marks. The long-goal,
  park-zone and corner groups are confirmed by the 3.23 in block pitch.
- Centre goal arm length is derived from reading 22.60 in as the full
  tip-to-tip span, which puts the tips at 62.21 / 78.19 and matches the
  reference drawing's tick marks. Worth confirming against a physical field.
