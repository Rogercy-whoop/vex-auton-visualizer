// ============================================================================
//  viewer/sim.js  --  replays the action log through the robot's own control
//                     loop, 10 ms at a time, on a field it cannot drive through
// ----------------------------------------------------------------------------
//  Three layers, and it matters which is which:
//
//    1. CONTROLLER -- class PID and the two move loops, transcribed line for
//       line from PID.cpp and drive.cpp, quirks included: no dt term, 10 ms
//       baked into the settle timers, previous_error starting at zero.
//       Nothing here is "improved".
//
//    2. PLANT -- stepChassis(). Voltage to wheel speed to motion. Exactly
//       three tunable constants, all in robot.js, all measurable.
//
//    3. WORLD -- collide.js. The robot stops at goals, loaders and walls, and
//       its encoders stop with it.
//
//  TWO HEADING FRAMES, and confusing them is the easiest bug in the project:
//    - the GYRO frame is what autons.cpp talks in. The gyro is never zeroed, so
//      it reads 0 wherever the robot happened to be placed.
//    - the FIELD frame is what the geometry needs, because obstacles sit at
//      fixed places on the field.
//  They differ by exactly the start orientation. st.h is a field heading;
//  st.hOff converts, once, at the top of each move.
//
//  Re-running on a drag costs a few thousand ticks and is the price of the
//  robot no longer being able to drive through a goal.
// ============================================================================

const wrap180 = (a) => { while (a >= 180) a -= 360; while (a < -180) a += 360; return a; };
const clamp   = (v, lo, hi) => (v > hi ? hi : v < lo ? lo : v);

// ---------------------------------------------------------------------------
//  PID -- transcription of PID.cpp
// ---------------------------------------------------------------------------
class PID {
  constructor(error, kp, ki, kd, starti, settle_error = 0, settle_time = 0, timeout = 0) {
    this.error = error;
    this.kp = kp; this.ki = ki; this.kd = kd; this.starti = starti;
    this.settle_error = settle_error; this.settle_time = settle_time; this.timeout = timeout;
    this.accumulated_error = 0;
    this.previous_error = 0;          // NOT seeded with `error` -- same as the template
    this.output = 0;
    this.time_spent_settled = 0;
    this.time_spent_running = 0;
  }
  compute(error) {                                            // PID.cpp:22-42
    if (Math.abs(error) < this.starti) this.accumulated_error += error;
    if ((error > 0 && this.previous_error < 0) || (error < 0 && this.previous_error > 0))
      this.accumulated_error = 0;
    this.output = this.kp * error + this.ki * this.accumulated_error
                + this.kd * (error - this.previous_error);
    this.previous_error = error;
    if (Math.abs(error) < this.settle_error) this.time_spent_settled += 10;
    else this.time_spent_settled = 0;
    this.time_spent_running += 10;
    return this.output;
  }
  is_settled() {                                              // PID.cpp:45-53
    if (this.time_spent_running > this.timeout && this.timeout !== 0) return true;
    if (this.time_spent_settled > this.settle_time) return true;
    return false;
  }
  exitReason() {
    if (this.time_spent_settled > this.settle_time) return 'settled';
    if (this.time_spent_running > this.timeout && this.timeout !== 0) return 'timeout';
    return 'running';
  }
}

// ---------------------------------------------------------------------------
//  The plant, plus the world.
//
//  state: { x, y, h, sL, sR, encL, encR, t }  -- x,y,h are FIELD coordinates
//  sL/sR   wheel surface speeds, in/s
//  encL/R  what each side's encoder has counted, inches
//
//  Differential drive: forward speed is the mean of the two sides, turn rate
//  their difference over the track width. Left faster turns clockwise, which
//  in this convention increases heading -- matching the template's
//  drive_with_voltage(drive + heading, drive - heading).
// ---------------------------------------------------------------------------
function stepChassis(st, vL, vR, R, world) {
  const P = R.sim, dt = P.tick_ms / 1000;
  const vmax = P.vmax_in_s * P.load_factor;

  const tL = Math.abs(vL) < P.v_dead ? 0 : (vL / 12) * vmax;   // dead band
  const tR = Math.abs(vR) < P.v_dead ? 0 : (vR / 12) * vmax;

  const k = Math.min(1, dt / P.tau_s);                          // first-order lag
  st.sL += (tL - st.sL) * k;
  st.sR += (tR - st.sR) * k;

  const v = (st.sL + st.sR) / 2;
  const w = (st.sL - st.sR) / R.track_in;                       // rad/s, clockwise +

  const x0 = st.x, y0 = st.y, h0 = st.h;
  const hMid = (st.h * Math.PI / 180) + w * dt / 2;             // midpoint heading
  st.x += v * dt * Math.sin(hMid);
  st.y += v * dt * Math.cos(hMid);
  st.h += w * dt * 180 / Math.PI;

  // --- the world pushes back ------------------------------------------------
  let contact = null;
  if (world) {
    const vel = { x: (st.x - x0) / dt, y: (st.y - y0) / dt };
    contact = resolveContacts(st, R, world.obstacles, vel, world.skip);
    if (contact && contact.real && contact.square) squareUp(st, contact, v, dt);
  }

  // --- encoders follow what the robot ACTUALLY did ---------------------------
  // A stalled VEX drive barely rotates, so a blocked robot's encoders barely
  // count. That is what makes the distance PID sit at full voltage seeing no
  // progress until its timeout expires.
  const dx = st.x - x0, dy = st.y - y0;
  const dh = (st.h - h0) * Math.PI / 180;
  const advance = dx * Math.sin(hMid) + dy * Math.cos(hMid);
  st.encL += advance + dh * R.track_in / 2;
  st.encR += advance - dh * R.track_in / 2;

  // keep the speed state consistent with the motion that actually happened
  if (contact) {
    const av = advance / dt, aw = dh / dt;
    st.sL = av + aw * R.track_in / 2;
    st.sR = av - aw * R.track_in / 2;
  }

  st.t += P.tick_ms;
  return contact;
}

function brake(st) { st.sL = 0; st.sR = 0; }        // DriveL.stop(hold) / DriveR.stop(hold)

const HANG_LIMIT_MS = 30000;                        // a timeout of 0 would loop forever

// Collects contacts during one move, keeping the most severe.
function noteContact(acc, c, t) {
  if (!c || !c.real) return acc;
  if (!acc || (!acc.unpredictable && (c.graze || !c.square))) {
    return { name: c.name, t, speed: c.speed, square: c.square,
             unpredictable: c.graze || !c.square };
  }
  return acc;
}

// ---------------------------------------------------------------------------
//  Move loops -- transcriptions of drive.cpp
// ---------------------------------------------------------------------------
function runDrive(st, a, R, ticks, moveIdx, world) {            // drive.cpp:191-225
  // The code's headings are GYRO headings, and the gyro reads 0 wherever the
  // robot was placed. st.h is a FIELD heading, because obstacles live on the
  // field. The two differ by exactly the start orientation, so every commanded
  // heading is converted once, here.
  const target = a.heading_deg + st.hOff;

  const drivePID   = new PID(a.distance_in, a.drive_kp, a.drive_ki, a.drive_kd,
                             a.drive_starti, a.settle_error, a.settle_time, a.timeout);
  const headingPID = new PID(wrap180(target - st.h), a.heading_kp, a.heading_ki,
                             a.heading_kd, a.heading_starti);
  const startAvg = (st.encL + st.encR) / 2;
  const t0 = st.t;
  let hung = false, contact = null;

  while (!drivePID.is_settled()) {
    const avg = (st.encL + st.encR) / 2;
    const driveErr   = a.distance_in + startAvg - avg;
    const headingErr = wrap180(target - st.h);
    const dOut = clamp(drivePID.compute(driveErr),     -a.drive_max_v,   a.drive_max_v);
    const hOut = clamp(headingPID.compute(headingErr), -a.heading_max_v, a.heading_max_v);
    contact = noteContact(contact, stepChassis(st, dOut + hOut, dOut - hOut, R, world), st.t);
    ticks.push({ t: st.t, x: st.x, y: st.y, h: st.h, move: moveIdx, ik: st.ik });
    if (st.t - t0 >= HANG_LIMIT_MS) { hung = true; break; }
  }
  brake(st);

  const achieved = (st.encL + st.encR) / 2 - startAvg;
  return {
    type: 'drive', i: a.i, ms: st.t - t0,
    asked: a.distance_in, achieved, gap: a.distance_in - achieved,
    headingAsked: a.heading_deg, headingEnd: st.h - st.hOff,
    headingGap: wrap180(target - st.h),
    exit: hung ? 'hung' : drivePID.exitReason(), timeout: a.timeout, contact,
  };
}

function runTurn(st, a, R, ticks, moveIdx, world) {             // drive.cpp:140-157
  const target = a.heading_deg + st.hOff;      // gyro heading -> field heading
  const pid = new PID(wrap180(target - st.h), a.turn_kp, a.turn_ki, a.turn_kd,
                      a.turn_starti, a.settle_error, a.settle_time, a.timeout);
  const t0 = st.t;
  let hung = false, contact = null;

  while (!pid.is_settled()) {
    const err = wrap180(target - st.h);
    const out = clamp(pid.compute(err), -a.turn_max_v, a.turn_max_v);
    contact = noteContact(contact, stepChassis(st, out, -out, R, world), st.t);
    ticks.push({ t: st.t, x: st.x, y: st.y, h: st.h, move: moveIdx, ik: st.ik });
    if (st.t - t0 >= HANG_LIMIT_MS) { hung = true; break; }
  }
  brake(st);

  return {
    type: 'turn', i: a.i, ms: st.t - t0,
    headingAsked: a.heading_deg, headingEnd: st.h - st.hOff,
    headingGap: wrap180(target - st.h),
    exit: hung ? 'hung' : pid.exitReason(), timeout: a.timeout, contact,
  };
}

function runWait(st, ms, ticks, moveIdx) {
  const n = Math.round(ms / ROBOT.sim.tick_ms);
  for (let i = 0; i < n; i++) {
    st.t += ROBOT.sim.tick_ms;
    ticks.push({ t: st.t, x: st.x, y: st.y, h: st.h, move: moveIdx, ik: st.ik });
  }
}

// ---------------------------------------------------------------------------
//  The naive reading of the code, for comparison: "turn to h, then go d". No
//  dynamics, no obstacles. This is what the programmer MEANT; the simulation
//  is what the robot does. The gap between the two lines is the point.
// ---------------------------------------------------------------------------
function intentPath(log, start) {
  const pts = [{ x: start.x, y: start.y, h: start.h }];
  let x = start.x, y = start.y, h = start.h;
  for (const a of log.actions) {
    if (a.type === 'turn') { h = a.heading_deg + start.h; pts.push({ x, y, h }); }
    if (a.type === 'drive') {
      h = a.heading_deg + start.h;
      const r = h * Math.PI / 180;
      x += a.distance_in * Math.sin(r);
      y += a.distance_in * Math.cos(r);
      pts.push({ x, y, h });
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
//  simulate(log, ROBOT, start, opts)
//
//    start      { x, y, h } where the robot is placed on the field
//    opts.hooks Set of action indices whose long-goal contact is INTENDED
//               (the descore hook entering the goal's top slot), so those
//               moves ignore long-goal collision
//
//  Returns { ticks, moves, events, intent, duration_ms, contacts, abort }
//  Poses in `ticks` are already field coordinates.
// ---------------------------------------------------------------------------
function simulate(log, R, start, opts) {
  opts = opts || {};
  const hooks = opts.hooks || new Set();
  const obstacles = buildObstacles();

  const st = { x: start.x, y: start.y, h: start.h, hOff: start.h,
               sL: 0, sR: 0, encL: 0, encR: 0, t: 0,
               ik: 0, intakeOn: false, shooterOn: false };
  const ticks = [{ t: 0, x: st.x, y: st.y, h: st.h, move: -1, ik: 0 }];
  const moves = [], events = [], contacts = [];
  let abort = null;

  for (const a of log.actions) {
    const idx = moves.length;
    const world = {
      obstacles,
      skip: hooks.has(a.i) ? new Set(['longgoal']) : null,
    };

    let m = null;
    switch (a.type) {
      case 'drive': m = runDrive(st, a, R, ticks, idx, world); moves.push(m); break;
      case 'turn':  m = runTurn (st, a, R, ticks, idx, world); moves.push(m); break;
      case 'wait':  runWait(st, a.ms, ticks, idx - 1); break;
      case 'motor':
        // intake running with the shooter stopped is intake_hold -- collecting.
        // intake plus shooter forward is intake_high -- ejecting out of the top.
        // The distinction is not asserted here; it comes straight out of
        // autofunction.cpp, which is the user's own code and is compiled.
        if (a.name === 'intake')  st.intakeOn  = a.action !== 'stop';
        if (a.name === 'shooter') st.shooterOn = a.action !== 'stop';
        st.ik = !st.intakeOn ? 0 : (st.shooterOn ? 2 : 1);
        events.push({ tick: ticks.length - 1, x: st.x, y: st.y, action: a });
        break;
      case 'pneumatic':
        events.push({ tick: ticks.length - 1, x: st.x, y: st.y, action: a });
        break;
      default: break;                       // config / exit records move nothing
    }

    if (m && m.contact) {
      contacts.push({ ...m.contact, move: a.i, type: m.type });
      if (m.contact.unpredictable) {
        // An oblique or corner impact makes everything after it a guess.
        // Better to stop and say so than to draw a confident wrong path.
        abort = { move: a.i, name: m.contact.name, t: m.contact.t };
        break;
      }
    }
  }

  const intake = computeIntake(ticks, R);

  return { ticks, moves, events, contacts, abort, ...intake,
           intent: intentPath(log, start), duration_ms: st.t };
}

// ---------------------------------------------------------------------------
//  computeIntake
//
//  A deliberately thin model, and worth being clear about what it does and
//  does not claim.
//
//  CLAIMS: while the intake is running, these blocks passed through the
//  capture zone in front of the robot, in this order, at these times. That is
//  geometry, and it is checkable against the field.
//
//  DOES NOT CLAIM: that the robot actually got them. Whether a block is drawn
//  in depends on approach angle, roller grip and how the block is sitting --
//  none of which are modelled, and guessing would produce a confident picture
//  that is wrong. What the tool is really useful for is the opposite finding:
//  the wedge sweeping over empty floor, which means the path missed.
//
//  Ejecting (intake_high) releases blocks at a fixed rate; where they end up
//  is not modelled either, so they simply leave the robot.
// ---------------------------------------------------------------------------
function intakeWedge(p, R) {
  const I = R.intake;
  const near = I.width_in / 2;
  const far  = near + I.reach_in * Math.tan(I.side_deg * Math.PI / 180);
  const y0 = R.length_in / 2 - R.center_offset_in;   // the robot's front face
  const y1 = y0 + I.reach_in;
  const a = p.h * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  // local (u = right, v = forward) -> field
  return [[-near, y0], [near, y0], [far, y1], [-far, y1]]
    .map(([u, v]) => ({ x: p.x + u * ca + v * sa, y: p.y - u * sa + v * ca }));
}

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function computeIntake(ticks, R) {
  const cap = R.intake.capacity, rate = R.intake.release_ms;
  const pickups = [];            // { id, tick, t }
  const releases = [];           // { tick, t }
  const carried = new Array(ticks.length).fill(0);
  const taken = new Set();
  let held = 0, ejectTimer = 0;

  for (let i = 0; i < ticks.length; i++) {
    const p = ticks[i];
    if (p.ik === 1 && held < cap) {
      const wedge = intakeWedge(p, R);
      for (const b of BLOCKS) {
        if (taken.has(b.id) || b.loader) continue;     // loader tubes need the plate
        if (pointInPoly(b, wedge)) {
          taken.add(b.id); held++; pickups.push({ id: b.id, tick: i, t: p.t });
          if (held >= cap) break;
        }
      }
    } else if (p.ik === 2 && held > 0) {
      ejectTimer += R.sim.tick_ms;
      if (ejectTimer >= rate) { ejectTimer = 0; held--; releases.push({ tick: i, t: p.t }); }
    } else {
      ejectTimer = 0;
    }
    carried[i] = held;
  }

  return { pickups, releases, carried, capacity: cap };
}
