// ============================================================================
//  viewer/robot.js  --  everything about THIS robot that the code cannot know
// ----------------------------------------------------------------------------
//  Loaded as a script (not fetched) so the page works from file://.
//  This file is the single source of truth for robot geometry and for the
//  three physical constants the simulation needs. Edit numbers here; nothing
//  needs recompiling.
// ============================================================================
window.ROBOT = {

  // ---- footprint, inches. Measured estimate -- confirm with a ruler. -------
  length_in: 15.0,          // along the driving direction
  width_in:  13.5,          // across
  track_in:  12.0,          // wheel centre to wheel centre (sets turn radius)

  // The pose point is the midpoint between the drive wheels. For this chassis
  // that is the geometric centre of the drive base; a non-zero value shifts it
  // toward the front (+) or rear (-) along the length.
  center_offset_in: 0,

  // ---- intake capture zone, in front of the robot --------------------------
  // A rectangle the width of the five rollers, plus a small wedge each side,
  // reaching about one and a half blocks ahead. Shown while the intake runs.
  intake: {
    width_in: 8.5,
    reach_in: 4.8,           // 1.5 x 3.23 in block
    side_deg: 15,
    // Blocks the robot can hold at once.  [CALIBRATE]
    //
    // Must be at least 6 for lanyou to behave as it does on the field: it
    // collects three from the middle of the field (autons.cpp:286), stops the
    // intake without ejecting (:293), and only then drives to a loader and
    // draws three more (:299-302). Nothing is ejected in between, so all six
    // are aboard at once before intake_high fires at :309.
    capacity: 6,
    release_ms: 350,         // time to eject one block            [CALIBRATE]
  },

  // ---- the pneumatic intake plate ------------------------------------------
  // In the code this is `matchload`. It deploys forward and LOW, so it slides
  // underneath a loader tube rather than hitting it. That is why it is
  // deliberately NOT part of the collision footprint: collision uses the
  // chassis rectangle above, which is what actually stops against the tube.
  // Set `collides` true if your plate sits high enough to catch on things.
  plate: {
    reach_in: 5.0,           // how far it extends past the chassis
    collides: false,
    // Time to draw one block down out of a loader, with the plate deployed and
    // the intake running.  [CALIBRATE]
    //
    // Set from the routine itself rather than guessed: lanyou deploys the
    // plate, drives into the loader, runs the intake and dwells 0.8 s
    // (autons.cpp:299-302), and that is known to empty the lower three blocks
    // and leave the upper three. 800 ms / 3 gives this number.
    //
    // In reality the rate moves with battery charge, air pressure and how the
    // stack is sitting, so treat it as an estimate with a wide error bar. What
    // it is good for is relative: "this dwell gets about three, that one about
    // one", not "exactly three".
    loader_ms: 265,
  },

  // ---- drivetrain model: the ONLY physics in the simulator -----------------
  // Everything else in the control loop is copied from the template verbatim.
  // These three numbers stand between commanded voltage and actual motion,
  // and each is measurable on the real robot:
  sim: {
    // Free speed at 12 V. Derived, not guessed:
    //   600 rpm cartridge x 0.75 gear ratio = 450 rpm at the wheel
    //   450 / 60 x pi x 3.25 in = 76.6 in/s
    vmax_in_s: 76.6,

    // Fraction of free speed actually reached under load.  [CALIBRATE]
    // 1.0 would mean a frictionless robot with weightless wheels.
    load_factor: 0.75,

    // Time constant of the speed response, seconds.  [CALIBRATE]
    // How long the chassis takes to reach ~63% of a commanded speed change.
    tau_s: 0.12,

    // Volts below which the drivetrain does not move at all.  [CALIBRATE]
    // Static friction plus motor dead band. This is what turns the pure-P
    // drive loop's asymptotic approach into a real, finite steady-state error.
    v_dead: 1.0,

    tick_ms: 10,             // matches task::sleep(10) in drive.cpp
  },
};
