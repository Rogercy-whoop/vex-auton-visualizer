// ============================================================================
//  viewer/robot.js  --  what the simulator knows about the robot that the code
//                       does not say
// ----------------------------------------------------------------------------
//  Most of what the simulator needs comes from the team's own code: PID gains,
//  timeouts, the wheel size, the gearing, the motor cartridge. What code cannot
//  say -- how big the robot is, how its intake is shaped, which motor
//  combination means "collecting" -- comes from the team's ROBOT PROFILE
//  (profiles/*.json), which the build hands to the viewer as out/profile.js.
//
//  The values below are the defaults, and are our robot's (117V). Any field a
//  profile supplies replaces the one here.
// ============================================================================
window.ROBOT = {

  team: '117V',

  // ---- footprint, inches ---------------------------------------------------
  length_in: 15.0,          // along the driving direction, bumpers included
  width_in:  13.5,          // across
  track_in:  12.0,          // wheel centre to wheel centre (sets turn radius)

  // The pose point is the midpoint between the drive wheels. A non-zero value
  // shifts it toward the front (+) or rear (-) along the length.
  center_offset_in: 0,

  // ---- intake ---------------------------------------------------------------
  intake: {
    // Capture zone: a rectangle the width of the rollers, a small wedge each
    // side, reaching about one and a half blocks ahead.
    width_in: 8.5,
    reach_in: 4.8,           // 1.5 x 3.23 in block
    side_deg: 15,

    // Blocks held at once. At least 6 for us: lanyou collects three from the
    // middle of the field (autons.cpp:286), stops the intake WITHOUT ejecting
    // (:293), then draws three more from a loader (:299-302); nothing leaves
    // until intake_high at :309.
    capacity: 6,
    release_ms: 350,         // time to eject one block

    // Which motor states mean what, in the team's own device names. Each
    // listed motor must be in that state: "fwd", "reverse", "stop", or "spin"
    // for either direction. Ours come straight out of autofunction.cpp:
    //   intake_hold() spins intake in reverse and stops shooter  -> collecting
    //   intake_high() spins intake in reverse and shooter forward -> ejecting
    collect_when: { intake: 'reverse', shooter: 'stop' },
    eject_when:   { intake: 'reverse', shooter: 'fwd' },
  },

  // ---- the intake plate -----------------------------------------------------
  // Deploys forward and LOW, so it slides under a loader tube instead of
  // hitting it -- which is why it is not part of the collision footprint.
  plate: {
    pneumatic: 'matchload',  // the digital_out that deploys it
    reach_in: 5.0,
    collides: false,
    // Time to draw one block down out of a loader. Set from the routine, not
    // guessed: lanyou's 0.8 s dwell at autons.cpp:302 takes the lower three
    // blocks and leaves the upper three, so 800 / 3. The real rate moves with
    // battery charge and air pressure; read it as "about three", not "three".
    loader_ms: 265,
  },

  // ---- drivetrain model: the only physics in the simulator -----------------
  // Everything else is transcribed from the template. These stand between
  // commanded voltage and actual motion, and each is measurable.
  sim: {
    // Free speed at 12 V -- used only if the log does not carry the chassis
    // geometry. Normally it is DERIVED from the team's main.cpp:
    //   cartridge rpm x wheel ratio x pi x wheel diameter / 60
    //   ours: 600 x 0.75 x pi x 3.25 / 60 = 76.6 in/s
    vmax_in_s: 76.6,
    load_factor: 0.75,       // fraction of free speed reached under load   [estimate]
    tau_s: 0.12,             // speed response time constant, seconds       [estimate]
    v_dead: 0.6,             // volts below which the drive does not move   [chosen]
    //   0.6 is the largest value at which the template's turns can settle (with
    //   turn kp = 0.47, a 2-degree error asks for only 0.94 V). They do settle on
    //   the robot, so 1.0 was wrong. Chosen to match behaviour, not measured.
    tick_ms: 10,             // matches task::sleep(10) in drive.cpp
  },
};

// A team's profile, if the build supplied one, replaces the defaults field by
// field. Nested groups (intake, plate, sim) are merged one level deep, so a
// profile only has to state what differs.
(function applyProfile(p) {
  if (!p) return;
  const R = window.ROBOT;
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && R[k] && typeof R[k] === 'object') {
      for (const kk of Object.keys(v)) {
        // a rule object (collect_when / eject_when) is replaced whole, not merged:
        // a team's rule should never inherit a motor name from ours
        R[k][kk] = v[kk];
      }
    } else if (k !== 'robot') {
      R[k] = v;
    }
  }
})(window.VEXSIM_PROFILE);
