// ============================================================================
//  viewer/sim.js  --  replays the action log through the robot's own control
//                     loop, 10 ms at a time
// ----------------------------------------------------------------------------
//  Two things live here and it matters which is which:
//
//    1. The CONTROLLER -- class PID and the two move loops. These are
//       transcribed line for line from the template (PID.cpp, drive.cpp),
//       including its quirks: no dt term, the 10 ms hard-coded into the
//       settle timers, previous_error starting at zero. Nothing is "improved".
//
//    2. The PLANT -- stepChassis(). This is the only invented part: how a
//       voltage becomes wheel speed becomes motion. It has exactly three
//       tunable numbers, all in robot.js, all physically measurable.
//
//  Everything is computed in the ROBOT FRAME: the robot starts at (0,0) with
//  heading 0 and the gyro reads 0. The viewer places that frame on the field
//  with a rigid transform, so dragging the start pose never re-runs this.
//
//  Heading convention throughout: degrees, 0 = +Y, clockwise positive.
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
    this.previous_error = 0;          // NOT initialised to `error` -- same as the template
    this.output = 0;
    this.time_spent_settled = 0;
    this.time_spent_running = 0;
  }

  compute(error) {                    // PID.cpp:22-42
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

  is_settled() {                      // PID.cpp:45-53
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
//  The plant.
//
//  state: { x, y, h, sL, sR, encL, encR, t }
//    sL/sR   current wheel surface speeds, in/s
//    encL/R  distance each side has rolled, in  (what the encoders report)
//
//  Differential drive: forward speed is the mean of the two sides, turn rate
//  is their difference over the track width. Left faster than right turns the
//  robot clockwise, which in this convention INCREASES heading -- matching
//  drive_with_voltage(drive + heading, drive - heading) in the template.
// ---------------------------------------------------------------------------
function stepChassis(st, vL, vR, R) {
  const P = R.sim, dt = P.tick_ms / 1000;
  const vmax = P.vmax_in_s * P.load_factor;

  // dead band: below v_dead the motors cannot overcome static friction
  const tL = Math.abs(vL) < P.v_dead ? 0 : (vL / 12) * vmax;
  const tR = Math.abs(vR) < P.v_dead ? 0 : (vR / 12) * vmax;

  // first-order lag toward the target speed
  const k = Math.min(1, dt / P.tau_s);
  st.sL += (tL - st.sL) * k;
  st.sR += (tR - st.sR) * k;

  const v = (st.sL + st.sR) / 2;
  const w = (st.sL - st.sR) / R.track_in;          // rad/s, clockwise +

  // integrate with the midpoint heading for second-order accuracy
  const hMid = (st.h * Math.PI / 180) + w * dt / 2;
  st.x += v * dt * Math.sin(hMid);
  st.y += v * dt * Math.cos(hMid);
  st.h += w * dt * 180 / Math.PI;

  st.encL += st.sL * dt;
  st.encR += st.sR * dt;
  st.t += P.tick_ms;
}

function brake(st) { st.sL = 0; st.sR = 0; }      // DriveL.stop(hold) / DriveR.stop(hold)

// Safety net: a move whose PID can never settle AND has timeout 0 would loop
// forever -- on the real robot too. Cap it and report it.
const HANG_LIMIT_MS = 30000;

// ---------------------------------------------------------------------------
//  Move loops -- transcriptions of drive.cpp
// ---------------------------------------------------------------------------
function runDrive(st, a, R, ticks, moveIdx) {           // drive.cpp:191-225
  const drivePID   = new PID(a.distance_in, a.drive_kp, a.drive_ki, a.drive_kd,
                             a.drive_starti, a.settle_error, a.settle_time, a.timeout);
  const headingPID = new PID(wrap180(a.heading_deg - st.h), a.heading_kp, a.heading_ki,
                             a.heading_kd, a.heading_starti);
  const startAvg = (st.encL + st.encR) / 2;
  const t0 = st.t;
  let hung = false;

  while (!drivePID.is_settled()) {
    const avg = (st.encL + st.encR) / 2;
    const driveErr   = a.distance_in + startAvg - avg;
    const headingErr = wrap180(a.heading_deg - st.h);
    const dOut = clamp(drivePID.compute(driveErr),     -a.drive_max_v,   a.drive_max_v);
    const hOut = clamp(headingPID.compute(headingErr), -a.heading_max_v, a.heading_max_v);
    stepChassis(st, dOut + hOut, dOut - hOut, R);
    ticks.push({ t: st.t, x: st.x, y: st.y, h: st.h, move: moveIdx });
    if (st.t - t0 >= HANG_LIMIT_MS) { hung = true; break; }
  }
  brake(st);

  const achieved = (st.encL + st.encR) / 2 - startAvg;
  return {
    type: 'drive', i: a.i, ms: st.t - t0,
    asked: a.distance_in, achieved,
    gap: a.distance_in - achieved,
    headingAsked: a.heading_deg, headingEnd: st.h,
    headingGap: wrap180(a.heading_deg - st.h),
    exit: hung ? 'hung' : drivePID.exitReason(),
    timeout: a.timeout,
  };
}

function runTurn(st, a, R, ticks, moveIdx) {            // drive.cpp:140-157
  const pid = new PID(wrap180(a.heading_deg - st.h), a.turn_kp, a.turn_ki, a.turn_kd,
                      a.turn_starti, a.settle_error, a.settle_time, a.timeout);
  const t0 = st.t;
  let hung = false;

  while (!pid.is_settled()) {
    const err = wrap180(a.heading_deg - st.h);
    const out = clamp(pid.compute(err), -a.turn_max_v, a.turn_max_v);
    stepChassis(st, out, -out, R);
    ticks.push({ t: st.t, x: st.x, y: st.y, h: st.h, move: moveIdx });
    if (st.t - t0 >= HANG_LIMIT_MS) { hung = true; break; }
  }
  brake(st);

  return {
    type: 'turn', i: a.i, ms: st.t - t0,
    headingAsked: a.heading_deg, headingEnd: st.h,
    headingGap: wrap180(a.heading_deg - st.h),
    exit: hung ? 'hung' : pid.exitReason(),
    timeout: a.timeout,
  };
}

function runWait(st, ms, ticks, moveIdx) {
  const n = Math.round(ms / ROBOT.sim.tick_ms);
  for (let i = 0; i < n; i++) {
    st.t += ROBOT.sim.tick_ms;
    ticks.push({ t: st.t, x: st.x, y: st.y, h: st.h, move: moveIdx });
  }
}

// ---------------------------------------------------------------------------
//  The naive reading of the code, for comparison: "turn to h, go d". No
//  dynamics at all. This is what the programmer MEANT; the simulation above
//  is what the robot does. The gap between the two lines is the point.
// ---------------------------------------------------------------------------
function intentPath(log) {
  const pts = [{ x: 0, y: 0, h: 0 }];
  let x = 0, y = 0, h = 0;
  for (const a of log.actions) {
    if (a.type === 'turn') { h = a.heading_deg; pts.push({ x, y, h }); }
    if (a.type === 'drive') {
      h = a.heading_deg;
      const r = h * Math.PI / 180;
      x += a.distance_in * Math.sin(r);
      y += a.distance_in * Math.cos(r);
      pts.push({ x, y, h });
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
//  simulate(log, ROBOT) -> { ticks, moves, events, intent, duration_ms }
//    ticks   one pose per 10 ms, robot frame
//    moves   one summary per drive/turn: asked vs achieved, exit reason
//    events  zero-duration actions (pneumatics, motors) with the tick they
//            occurred at, for markers on the path
// ---------------------------------------------------------------------------
function simulate(log, R) {
  const st = { x: 0, y: 0, h: 0, sL: 0, sR: 0, encL: 0, encR: 0, t: 0 };
  const ticks = [{ t: 0, x: 0, y: 0, h: 0, move: -1 }];
  const moves = [], events = [];

  for (const a of log.actions) {
    const idx = moves.length;
    switch (a.type) {
      case 'drive': moves.push(runDrive(st, a, R, ticks, idx)); break;
      case 'turn':  moves.push(runTurn (st, a, R, ticks, idx)); break;
      case 'wait':  runWait(st, a.ms, ticks, idx - 1); break;
      case 'motor':
      case 'pneumatic':
        events.push({ tick: ticks.length - 1, x: st.x, y: st.y, action: a });
        break;
      default: break;          // config / exit records change nothing here
    }
  }

  return { ticks, moves, events, intent: intentPath(log), duration_ms: st.t };
}
