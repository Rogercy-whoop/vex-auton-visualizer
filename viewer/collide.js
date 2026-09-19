// ============================================================================
//  viewer/collide.js  --  the robot cannot drive through the field
// ----------------------------------------------------------------------------
//  Without this the simulation reports where the wheels WOULD have carried the
//  robot. On a real field a routine that drives hard into a goal stops at the
//  goal, and every later move starts from there. Ignoring that does not make
//  the picture slightly optimistic -- it makes everything after the first
//  contact fiction.
//
//  Three things happen on contact:
//
//    1. The robot is pushed back out of the obstacle. It ends up against it.
//
//    2. The wheels keep turning but the robot stops moving, so the ENCODERS
//       stop advancing too (a stalled VEX drive barely rotates). The distance
//       PID therefore never sees progress, keeps commanding full voltage, and
//       exits on its timeout having gone nowhere. This is the honest outcome
//       and it falls out of the model rather than being special-cased.
//
//    3. If the hit is square, the reaction squares the robot up -- the classic
//       "drive into the wall to straighten out" trick. If the hit is oblique
//       or a corner graze, what happens next is genuinely unpredictable, so
//       the simulation says so and stops rather than inventing a trajectory.
// ============================================================================

const CONTACT = {
  SQUARE_COS: 0.80,        // cos(~37 deg): above this the hit counts as square
  GRAZE_COS: 0.30,         // below this it is a glance, not a real impact
  MIN_SPEED: 3.0,          // in/s into the surface before a contact is "real"
  ALIGN_RATE: 220,         // deg/s of squaring-up at full push
};

// ---------------------------------------------------------------------------
//  Obstacles. Only things tall enough to stop this robot are listed: the park
//  zone bars stand 1 in off the floor and are driven straight over, so they
//  are not obstacles.
// ---------------------------------------------------------------------------
function buildObstacles() {
  const O = [];
  const C = FIELD.CENTER;

  for (const gy of FIELD.LONG_GOAL.y)
    O.push({ kind: 'obb', name: 'long goal', group: 'longgoal',
             cx: C, cy: gy, hu: FIELD.LONG_GOAL.length / 2, hv: FIELD.LONG_GOAL.width / 2, ang: 0 });

  for (const a of [45, -45])
    O.push({ kind: 'obb', name: 'centre goal', group: 'centregoal',
             cx: C, cy: C, hu: FIELD.CENTER_GOAL.arm, hv: FIELD.CENTER_GOAL.width / 2, ang: a });

  for (const lx of FIELD.LOADER.x)
    for (const ly of FIELD.LOADER.y)
      O.push({ kind: 'circle', name: 'loader', group: 'loader',
               cx: lx, cy: ly, r: FIELD.LOADER.diameter / 2 });

  return O;
}

// ---------------------------------------------------------------------------
//  Oriented box helpers
// ---------------------------------------------------------------------------
function obbFromAngle(cx, cy, hu, hv, angDeg) {
  const a = angDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  return { c: { x: cx, y: cy }, u: { x: ca, y: sa }, v: { x: -sa, y: ca }, hu, hv };
}

// The robot's box, expressed the same way. Heading is the compass convention
// (0 = +Y, clockwise positive), so forward is (sin h, cos h) and right is
// (cos h, -sin h).
function robotBox(p, R) {
  const a = p.h * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const fwd = { x: sa, y: ca }, right = { x: ca, y: -sa };
  const off = R.center_offset_in;
  return {
    c: { x: p.x - fwd.x * off, y: p.y - fwd.y * off },
    u: right, v: fwd, hu: R.width_in / 2, hv: R.length_in / 2, fwd,
  };
}

function boxCorners(b) {
  const out = [];
  for (const [su, sv] of [[1, 1], [-1, 1], [-1, -1], [1, -1]])
    out.push({ x: b.c.x + b.u.x * b.hu * su + b.v.x * b.hv * sv,
               y: b.c.y + b.u.y * b.hu * su + b.v.y * b.hv * sv });
  return out;
}

function projectBox(b, ax) {
  const c = b.c.x * ax.x + b.c.y * ax.y;
  const r = Math.abs((b.u.x * ax.x + b.u.y * ax.y) * b.hu)
          + Math.abs((b.v.x * ax.x + b.v.y * ax.y) * b.hv);
  return [c - r, c + r];
}

// Separating Axis Theorem. Returns the minimum translation that pushes box A
// out of box B, or null when they do not overlap.
function mtvBoxBox(A, B) {
  let best = Infinity, axis = null;
  for (const ax of [A.u, A.v, B.u, B.v]) {
    const [a0, a1] = projectBox(A, ax), [b0, b1] = projectBox(B, ax);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= 0) return null;                      // found a gap: no contact
    if (overlap < best) { best = overlap; axis = ax; }
  }
  // point the axis from B toward A, so it pushes A out
  const d = { x: A.c.x - B.c.x, y: A.c.y - B.c.y };
  const s = (d.x * axis.x + d.y * axis.y) < 0 ? -1 : 1;
  return { depth: best, nx: axis.x * s, ny: axis.y * s };
}

function mtvBoxCircle(A, cx, cy, r) {
  // work in the box's frame, where the nearest point is a simple clamp
  const d = { x: cx - A.c.x, y: cy - A.c.y };
  const lu = d.x * A.u.x + d.y * A.u.y, lv = d.x * A.v.x + d.y * A.v.y;
  const qu = Math.max(-A.hu, Math.min(A.hu, lu)), qv = Math.max(-A.hv, Math.min(A.hv, lv));
  const du = lu - qu, dv = lv - qv;
  const dist2 = du * du + dv * dv;

  if (dist2 > r * r) return null;
  if (dist2 > 1e-9) {
    const dist = Math.sqrt(dist2), depth = r - dist;
    const nx = -(du / dist) * A.u.x - (dv / dist) * A.v.x;   // from circle toward box
    const ny = -(du / dist) * A.u.y - (dv / dist) * A.v.y;
    return { depth, nx, ny };
  }
  // circle centre inside the box: push out of the nearest face
  const eu = A.hu - Math.abs(lu), ev = A.hv - Math.abs(lv);
  if (eu < ev) { const s = lu > 0 ? -1 : 1; return { depth: eu + r, nx: A.u.x * s, ny: A.u.y * s }; }
  const s = lv > 0 ? -1 : 1;
  return { depth: ev + r, nx: A.v.x * s, ny: A.v.y * s };
}

// Walls: the robot's corners must stay inside the playing floor.
function mtvWalls(A) {
  const cs = boxCorners(A), S = FIELD.SIZE;
  let best = null;
  const consider = (depth, nx, ny, side) => {
    if (depth > 0 && (!best || depth > best.depth)) best = { depth, nx, ny, side };
  };
  consider(-Math.min(...cs.map(c => c.x)),      1,  0, 'left wall');
  consider(Math.max(...cs.map(c => c.x)) - S,  -1,  0, 'right wall');
  consider(-Math.min(...cs.map(c => c.y)),      0,  1, 'bottom wall');
  consider(Math.max(...cs.map(c => c.y)) - S,   0, -1, 'top wall');
  return best;
}

// ---------------------------------------------------------------------------
//  resolveContacts
//
//  Pushes the robot out of anything it overlaps and classifies the worst
//  contact. `vel` is the robot's velocity before the push, used to tell a
//  genuine impact from resting contact.
//
//  Returns null, or { name, square, graze, nx, ny, speed, pushed }.
// ---------------------------------------------------------------------------
function resolveContacts(p, R, obstacles, vel, skipGroups) {
  let worst = null, pushed = 0;

  for (let iter = 0; iter < 4; iter++) {          // a few passes settle corners
    const A = robotBox(p, R);
    let hit = null, name = null;

    const w = mtvWalls(A);
    if (w) { hit = w; name = w.side; }

    // broad phase: most obstacles are nowhere near the robot on any given
    // tick, and a distance test is far cheaper than running SAT on all of them
    const reach = Math.hypot(R.length_in, R.width_in) / 2;
    for (const o of obstacles) {
      if (skipGroups && skipGroups.has(o.group)) continue;
      const far = o.kind === 'obb' ? Math.hypot(o.hu, o.hv) : o.r;
      if (Math.hypot(o.cx - A.c.x, o.cy - A.c.y) > reach + far) continue;
      const m = o.kind === 'obb'
        ? mtvBoxBox(A, obbFromAngle(o.cx, o.cy, o.hu, o.hv, o.ang))
        : mtvBoxCircle(A, o.cx, o.cy, o.r);
      if (m && (!hit || m.depth > hit.depth)) { hit = m; name = o.name; }
    }
    if (!hit) break;

    p.x += hit.nx * hit.depth;
    p.y += hit.ny * hit.depth;
    pushed += hit.depth;

    // speed into the surface, and how square the approach was
    const speed = -(vel.x * hit.nx + vel.y * hit.ny);
    const vmag = Math.hypot(vel.x, vel.y);
    const cosApproach = vmag > 1e-6 ? speed / vmag : 0;

    if (!worst || speed > worst.speed)
      worst = { name, nx: hit.nx, ny: hit.ny, speed,
                square: cosApproach >= CONTACT.SQUARE_COS,
                graze:  cosApproach <  CONTACT.GRAZE_COS,
                real:   speed >= CONTACT.MIN_SPEED };
  }

  if (!worst) return null;
  worst.pushed = pushed;
  return worst;
}

// ---------------------------------------------------------------------------
//  squareUp
//
//  A robot driving squarely into a flat surface is rotated flat by the
//  reaction: whichever corner touches first cannot penetrate, so the body
//  pivots about it until both corners are down. Modelled as a bounded rotation
//  toward the nearest heading that faces the surface, at a rate set by how
//  hard the robot is still pushing.
// ---------------------------------------------------------------------------
function squareUp(st, contact, push, dt) {
  // heading that points straight into the surface (normal points out of it)
  const into = Math.atan2(-contact.nx, -contact.ny) * 180 / Math.PI;
  // the robot may be against it front-on or back-on; pick the nearer
  const cands = [into, into + 180];
  let err = Infinity;
  for (const t of cands) { const e = wrap180(t - st.h); if (Math.abs(e) < Math.abs(err)) err = e; }
  const rate = CONTACT.ALIGN_RATE * Math.min(1, Math.abs(push) / 6);
  const step = Math.max(-rate * dt, Math.min(rate * dt, err));
  st.h += step;
}
