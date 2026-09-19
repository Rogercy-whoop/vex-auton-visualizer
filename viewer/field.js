// ============================================================================
//  viewer/field.js  --  VEX V5RC 2025-26 "Push Back" field geometry + drawing
// ----------------------------------------------------------------------------
//  All dimensions in INCHES, from the official 276-9142 field drawings.
//
//  COORDINATE SYSTEM
//      origin (0,0) = bottom-left corner of the playing floor
//      +X right, +Y up
//      heading 0 deg = +Y, CLOCKWISE positive   (the robot's own convention)
//      x += d*sin(theta),  y += d*cos(theta)
//
//  RENDERING POLICY
//      Every object's FOOTPRINT is drawn at its true position. Height is shown
//      the way a camera above the centre of the field sees it: an object's top
//      is displaced outward in proportion to its height, and the side faces
//      that exposes are filled in.
//
//      The displacement is RIGID -- the whole top moves together, by the amount
//      computed for the object's centre. Displacing each corner separately is
//      what a real lens does, but it stretches a long bar near the middle of
//      the field into a wedge, because its two ends lean in opposite
//      directions. Rigid displacement keeps every shape the shape it really is.
// ============================================================================

const FIELD = {
  SIZE: 140.4,
  CENTER: 70.2,
  TILE: 140.4 / 6,            // 23.4 in
  WALL_THICKNESS: 2.2,

  // Long Goal: 48.79 in overall x 5.53 in wide, 12.67 in tall. Centre lines
  // y = 23.44 / 116.97; the span 45.83..94.62 matches the reference ticks.
  LONG_GOAL: { length: 48.79, width: 5.53, height: 12.67, y: [23.44, 116.97],
               cap: 5.87, band: 6.0, slot: 1.95 },

  // Centre Goal: 573.99 mm = 22.60 in is the FULL tip-to-tip length of each
  // diagonal, so each arm reaches 11.30 in from the centre, putting the tips at
  // 70.2 +/- 7.99 = 62.21 / 78.19 -- exactly the drawing's 62.22 / 78.19 ticks.
  // The two arms sit at different heights; the drawing labels them UPPER and
  // LOWER, and the upper-left to lower-right arm is the high one.
  CENTER_GOAL: { arm: 11.30, width: 4.00, slot: 1.95,
                 heightUpper: 12.54, heightLower: 10.77, upperAng: -45 },

  LOADER: { diameter: 4.17, height: 21.34, x: [2.58, 137.87], y: [23.44, 116.97] },
  PARK:   { depth: 16.86, height: 18.87, bar: 2.00, thick: 1.00 },
  BLOCK:  { size: 3.23, diagonal: 3.84, height: 3.23 },
};

// Virtual camera height above the field centre, inches. Larger = flatter.
const CAM_HEIGHT = 430;

// ---------------------------------------------------------------------------
//  Starting block positions. Confidence recorded per group; edit here only.
// ---------------------------------------------------------------------------
const BLOCKS = (() => {
  const B = [], C = FIELD.CENTER, T = FIELD.TILE, S = FIELD.BLOCK.size;
  let id = 0;
  const add = (x, y, color, extra) => B.push({ id: id++, x, y, color, ...(extra || {}) });
  const mirrorX = (x) => 140.43 - x;

  // Long goal troughs, 4 each                          [confirmed by tick pitch]
  for (const gy of FIELD.LONG_GOAL.y)
    [65.38, 68.61, 71.84, 75.07].forEach((x, i) => add(x, gy, i < 2 ? 'red' : 'blue'));

  // Park zones, 4 stacked                              [confirmed by tick pitch]
  for (const y of [65.36, 68.59, 71.82, 75.05]) { add(14.03, y, 'blue'); add(mirrorX(14.03), y, 'red'); }

  // Corner pairs hard against the top and bottom walls [confirmed by tick pitch]
  for (const [x0, x1] of [[21.46, 24.69], [mirrorX(24.69), mirrorX(21.46)]]) {
    const col = x0 < C ? 'blue' : 'red';
    add(x0, 138.80, col); add(x1, 138.80, col);
    add(x0, 1.61,   col); add(x1, 1.61,   col);
  }

  // Four L clusters around the centre goal: corner block on a tile-seam
  // intersection two tiles out, the other two along the seams pointing inward.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = C + sx * T, cy = C + sy * T, col = sx < 0 ? 'red' : 'blue';
    add(cx,          cy,          col);
    add(cx - sx * S, cy,          col);
    add(cx,          cy - sy * S, col);
  }

  // Loaders: three blocks stacked per tube.
  // Right side: lower tube blue, upper tube red. Left side mirrors it.
  const loaderColor = (lx, ly) => {
    const right = lx > C, lower = ly < C;
    return right ? (lower ? 'blue' : 'red') : (lower ? 'red' : 'blue');
  };
  for (const lx of FIELD.LOADER.x) for (const ly of FIELD.LOADER.y)
    for (let k = 0; k < 3; k++) add(lx, ly, loaderColor(lx, ly), { loader: true, stack: k });

  return B;
})();

// ---------------------------------------------------------------------------
//  Palette
// ---------------------------------------------------------------------------
const THEMES = {
  light: {
    wall: '#b9bec6', wallTop: '#d6dbe2',
    tileA: '#989ea6', tileB: '#8f959d',
    seam: 'rgba(48,54,62,0.34)', seamHi: 'rgba(255,255,255,0.12)',
    tape: 'rgba(250,251,253,0.70)',
    glass: 'rgba(226,232,240,0.60)', glassEdge: 'rgba(58,68,80,0.55)',
    glassSide: 'rgba(168,178,190,0.80)', glassHi: 'rgba(255,255,255,0.75)',
    slot: 'rgba(78,88,101,0.38)',
    strut: '#e0892d', strutSide: '#a8621b',
    red: '#d9283c', redSide: '#8e1a27', blue: '#2492e6', blueSide: '#155f9a',
    shadow: 'rgba(20,24,30,1)',
  },
  dark: {
    wall: '#363b43', wallTop: '#474d56',
    tileA: '#7a8088', tileB: '#70767e',
    seam: 'rgba(15,18,23,0.48)', seamHi: 'rgba(255,255,255,0.09)',
    tape: 'rgba(245,248,252,0.68)',
    glass: 'rgba(208,218,230,0.50)', glassEdge: 'rgba(16,20,26,0.62)',
    glassSide: 'rgba(128,140,154,0.78)', glassHi: 'rgba(255,255,255,0.60)',
    slot: 'rgba(18,22,28,0.50)',
    strut: '#d9822b', strutSide: '#96581a',
    red: '#e0243c', redSide: '#8c1625', blue: '#2196f3', blueSide: '#125b95',
    shadow: 'rgba(0,0,0,1)',
  },
};
let P = THEMES.light;
function setTheme(name) { P = THEMES[name] || THEMES.light; }

// ---------------------------------------------------------------------------
//  Geometry helpers
// ---------------------------------------------------------------------------
function pathOf(ctx, pts) {
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
}
function centroid(pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x / pts.length; cy += p.y / pts.length; }
  return { x: cx, y: cy };
}
// Rigid outward displacement for a shape of height h.
function shiftOf(pts, h) {
  const c = centroid(pts), k = h / CAM_HEIGHT;
  return { dx: (c.x - FIELD.CENTER) * k, dy: (c.y - FIELD.CENTER) * k };
}
function shiftPts(pts, h) {
  const { dx, dy } = shiftOf(pts, h);
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

function withShadow(ctx, heightIn, shape) {
  const d = Math.min(heightIn * 0.05, 1.2);
  for (const [k, a] of [[1.0, 0.09], [0.6, 0.09], [0.25, 0.09]]) {
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = P.shadow;
    ctx.translate(d * k, -d * k);
    shape(ctx); ctx.fill();
    ctx.restore();
  }
}

// An object standing between heights z0 and z1. Returns its top polygon.
// Only the faces pointing the same way as the displacement are visible; the
// rest are hidden beneath the top.
function drawPrism(ctx, base, z0, z1, sideFill, topFill, edge) {
  const lo = shiftPts(base, z0), hi = shiftPts(base, z1);
  const s = shiftOf(base, z1 - z0);
  const n = base.length, c = centroid(base);

  if (sideFill && (Math.abs(s.dx) > 1e-6 || Math.abs(s.dy) > 1e-6)) {
    ctx.fillStyle = sideFill;
    for (let i = 0; i < n; i++) {
      const a = base[i], b = base[(i + 1) % n];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      let nx = b.y - a.y, ny = -(b.x - a.x);
      if (nx * (mx - c.x) + ny * (my - c.y) < 0) { nx = -nx; ny = -ny; }
      if (nx * s.dx + ny * s.dy <= 0) continue;
      const j = (i + 1) % n;
      ctx.beginPath();
      ctx.moveTo(lo[i].x, lo[i].y); ctx.lineTo(lo[j].x, lo[j].y);
      ctx.lineTo(hi[j].x, hi[j].y); ctx.lineTo(hi[i].x, hi[i].y);
      ctx.closePath(); ctx.fill();
    }
  }
  if (topFill) { ctx.fillStyle = topFill; pathOf(ctx, hi); ctx.fill(); }
  if (edge)    { ctx.strokeStyle = edge; ctx.lineWidth = 0.14; pathOf(ctx, hi); ctx.stroke(); }
  return hi;
}

function octPts(x, y, size) {
  const h = size / 2, k = h * 0.414;
  return [{ x: x - h + k, y: y - h }, { x: x + h - k, y: y - h }, { x: x + h, y: y - h + k },
          { x: x + h, y: y + h - k }, { x: x + h - k, y: y + h }, { x: x - h + k, y: y + h },
          { x: x - h, y: y + h - k }, { x: x - h, y: y - h + k }];
}
function circlePts(cx, cy, r, n = 28) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return out;
}
const rectPts = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

// Local -> field, for a bar centred at (cx,cy) rotated by angDeg.
function barXform(cx, cy, angDeg) {
  const a = angDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  return (u, v) => ({ x: cx + u * ca - v * sa, y: cy + u * sa + v * ca });
}
// A faceted goal plate: chamfered ends, as moulded.
function barPlate(cx, cy, len, wid, angDeg, chamfer) {
  const T = barXform(cx, cy, angDeg), L = len / 2, W = wid / 2, c = Math.min(chamfer, W * 0.8);
  return [[-L, -W + c], [-L + c, -W], [L - c, -W], [L, -W + c],
          [L, W - c], [L - c, W], [-L + c, W], [-L, W - c]].map(([u, v]) => T(u, v));
}

// ---------------------------------------------------------------------------
//  Floor. The only marking a real field shows at this scale is the interlocking
//  teeth where tiles meet, so that is all that is drawn.
// ---------------------------------------------------------------------------
const TOOTH = { period: 2.34, depth: 0.42 };

function toothedSeam(ctx, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const n = Math.round(len / TOOTH.period), step = len / n, d = TOOTH.depth / 2;
  ctx.moveTo(x0, y0);
  for (let i = 0; i < n; i++) {
    const s = (i % 2 === 0) ? d : -d, a0 = i * step, a1 = (i + 1) * step;
    ctx.lineTo(x0 + ux * a0 + nx * s, y0 + uy * a0 + ny * s);
    ctx.lineTo(x0 + ux * a1 + nx * s, y0 + uy * a1 + ny * s);
  }
  ctx.lineTo(x1, y1);
}

function drawFloor(ctx, s) {
  const T = FIELD.TILE, N = 6;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    ctx.fillStyle = ((i + j) % 2 === 0) ? P.tileA : P.tileB;
    ctx.fillRect(i * T, j * T, T, T);
  }
  const seams = (toothed) => {
    ctx.beginPath();
    for (let i = 1; i < N; i++) {
      if (toothed) { toothedSeam(ctx, i * T, 0, i * T, FIELD.SIZE); toothedSeam(ctx, 0, i * T, FIELD.SIZE, i * T); }
      else { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, FIELD.SIZE); ctx.moveTo(0, i * T); ctx.lineTo(FIELD.SIZE, i * T); }
    }
    ctx.stroke();
  };
  const lw = Math.max(0.1, 1.2 / s), toothed = s > 2.5;
  ctx.strokeStyle = P.seamHi; ctx.lineWidth = lw * 2.2; seams(toothed);
  ctx.strokeStyle = P.seam;   ctx.lineWidth = lw;       seams(toothed);
}

function drawTape(ctx) {
  const C = FIELD.CENTER;
  ctx.fillStyle = P.tape;
  ctx.fillRect(C - 1.35, 0, 0.85, FIELD.SIZE);
  ctx.fillRect(C + 0.50, 0, 0.85, FIELD.SIZE);
}

function drawWall(ctx) {
  const W = FIELD.WALL_THICKNESS, S = FIELD.SIZE;
  ctx.fillStyle = P.wall;   ctx.fillRect(-W, -W, S + 2 * W, S + 2 * W);
  ctx.fillStyle = P.wallTop;
  ctx.fillRect(-W, S + W * 0.45, S + 2 * W, W * 0.55);
  ctx.fillRect(-W, -W, W * 0.55, S + 2 * W);
  ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = P.shadow;
  ctx.fillRect(0, S - 1.5, S, 1.5); ctx.fillRect(0, 0, 1.5, S);
  ctx.restore();
}

function drawParkZone(ctx, side) {
  const pk = FIELD.PARK, isLeft = side === 'left';
  const x0 = isLeft ? 0 : FIELD.SIZE - pk.depth, y0 = FIELD.CENTER - pk.height / 2, b = pk.bar;
  const col = isLeft ? P.red : P.blue, sideCol = isLeft ? P.redSide : P.blueSide;
  const bars = [
    rectPts(x0, y0 + pk.height - b, pk.depth, b),
    rectPts(x0, y0, pk.depth, b),
    isLeft ? rectPts(x0 + pk.depth - b, y0, b, pk.height) : rectPts(x0, y0, b, pk.height),
  ];
  for (const bar of bars) withShadow(ctx, 3, c => pathOf(c, bar));
  for (const bar of bars) drawPrism(ctx, bar, 0, pk.thick, sideCol, col, null);
}

// ---------------------------------------------------------------------------
//  Block. `z0` lets a block sit on top of others, which is what the loader
//  stacks need: without it the whole tube's worth of displacement shows up as
//  an exposed dark base and the top block looks black.
// ---------------------------------------------------------------------------
function drawBlock(ctx, b, alpha, z0) {
  const S = FIELD.BLOCK.size, lo = z0 || 0, hi = lo + FIELD.BLOCK.height;
  const col = b.color === 'red' ? P.red : P.blue, sideCol = b.color === 'red' ? P.redSide : P.blueSide;
  const base = octPts(b.x, b.y, S);

  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  if (!lo) withShadow(ctx, FIELD.BLOCK.height, c => pathOf(c, base));
  const top = drawPrism(ctx, base, lo, hi, sideCol, col, 'rgba(0,0,0,0.18)');
  const c = centroid(top);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  pathOf(ctx, octPts(c.x - S * 0.055, c.y + S * 0.055, S * 0.44)); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Long goal: one continuous faceted plate at full height. The orange is
//  PAINTED ON the plate -- end caps and a centre band -- rather than being
//  separate solid posts, which is what made the ends read as orange bricks.
//  Thin splayed feet at each end carry the weight.
// ---------------------------------------------------------------------------
function drawLongGoal(ctx, gy, blocks) {
  const g = FIELD.LONG_GOAL, C = FIELD.CENTER;
  const L = g.length, W = g.width, x0 = C - L / 2, y0 = gy - W / 2;

  withShadow(ctx, g.height, c => pathOf(c, rectPts(x0, y0, L, W)));
  for (const b of blocks) drawBlock(ctx, b);              // on the floor, under the bridge

  // splayed feet, low and narrow
  for (const fx of [x0 + 1.4, x0 + L - 1.4 - 2.2]) {
    drawPrism(ctx, rectPts(fx, y0 - 1.1, 2.2, W + 2.2), 0, g.height * 0.62, P.strutSide, P.strut, null);
  }

  const plate = barPlate(C, gy, L, W, 0, 1.3);
  const top = drawPrism(ctx, plate, 0, g.height, P.glassSide, P.glass, P.glassEdge);

  // everything painted on the top face is clipped to it
  ctx.save();
  pathOf(ctx, top); ctx.clip();
  const { dx, dy } = shiftOf(plate, g.height);
  const px = x0 + dx, py = y0 + dy;

  ctx.fillStyle = P.strut;                                   // end caps
  ctx.fillRect(px, py, g.cap, W);
  ctx.fillRect(px + L - g.cap, py, g.cap, W);
  ctx.fillRect(px + L / 2 - g.band / 2, py, g.band, W);      // centre band

  ctx.fillStyle = P.slot;                                    // the hook slot
  ctx.fillRect(px + g.cap, py + W / 2 - g.slot / 2, L - 2 * g.cap, g.slot);
  ctx.fillStyle = P.glassHi;                                 // specular streak
  ctx.fillRect(px + g.cap, py + W * 0.14, L - 2 * g.cap, 0.3);
  ctx.restore();

  ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.16; pathOf(ctx, top); ctx.stroke();
}

// ---------------------------------------------------------------------------
//  Centre goal: two crossed faceted arms at DIFFERENT heights.
//
//  At the middle of the field the camera is directly overhead, so there is no
//  displacement to read the height difference from. The cue that works is the
//  crossing itself: the lower arm is drawn first, the upper arm's shadow is
//  cast onto it, and only then the upper arm -- so one visibly passes over.
// ---------------------------------------------------------------------------
function drawCenterGoal(ctx) {
  const cg = FIELD.CENTER_GOAL, C = FIELD.CENTER, L = cg.arm * 2;
  const upper = cg.upperAng, lower = cg.upperAng + 90;

  const armPlate = (ang) => barPlate(C, C, L, cg.width, ang, 1.1);

  for (const ang of [lower, upper])
    withShadow(ctx, ang === upper ? cg.heightUpper : cg.heightLower, c => pathOf(c, armPlate(ang)));

  // orange bracing, under both arms
  drawPrism(ctx, circlePts(C, C, 2.5, 20), 0, cg.heightLower - 1.6, P.strutSide, P.strut, null);

  const paintArm = (ang, H) => {
    const plate = armPlate(ang);
    const top = drawPrism(ctx, plate, 0, H, P.glassSide, P.glass, P.glassEdge);
    ctx.save();
    pathOf(ctx, top); ctx.clip();
    const { dx, dy } = shiftOf(plate, H);
    ctx.translate(C + dx, C + dy); ctx.rotate(ang * Math.PI / 180);
    ctx.fillStyle = P.slot;    ctx.fillRect(-L / 2, -cg.slot / 2, L, cg.slot);
    ctx.fillStyle = P.glassHi; ctx.fillRect(-L / 2 + 0.8, -cg.width / 2 + cg.width * 0.13, L - 1.6, 0.28);
    ctx.restore();
    ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.16; pathOf(ctx, top); ctx.stroke();
    return top;
  };

  const lowTop = paintArm(lower, cg.heightLower);

  // the upper arm's shadow, falling across the lower one
  ctx.save();
  pathOf(ctx, lowTop); ctx.clip();
  ctx.globalAlpha = 0.22; ctx.fillStyle = P.shadow;
  ctx.translate(0.7, -0.7);
  pathOf(ctx, armPlate(upper)); ctx.fill();
  ctx.restore();

  paintArm(upper, cg.heightUpper);

  const hub = shiftPts(circlePts(C, C, 1.5, 16), cg.heightUpper);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; pathOf(ctx, hub); ctx.fill();
}

// ---------------------------------------------------------------------------
//  Loader: a clear tube with an orange collar, three blocks stacked inside.
// ---------------------------------------------------------------------------
function drawLoader(ctx, lx, ly, blocks) {
  const r = FIELD.LOADER.diameter / 2, H = FIELD.LOADER.height;
  const base = circlePts(lx, ly, r);

  withShadow(ctx, H, c => pathOf(c, base));
  drawPrism(ctx, base, 0, H, P.glassSide, null, null);        // the cylinder wall

  for (const b of (blocks || [])) drawBlock(ctx, b, 0.95, 1.2 + b.stack * 3.3);

  const top = shiftPts(base, H);
  ctx.fillStyle = P.glass;       pathOf(ctx, top); ctx.fill();
  ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.16; pathOf(ctx, top); ctx.stroke();

  const c = centroid(top);
  ctx.strokeStyle = P.strutSide; ctx.lineWidth = r * 0.48;
  ctx.beginPath(); ctx.arc(c.x, c.y - 0.3, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.strut; ctx.lineWidth = r * 0.42;
  ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.glassHi; ctx.lineWidth = r * 0.13;
  ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.93, Math.PI * 0.62, Math.PI * 1.18); ctx.stroke();
}

// ---------------------------------------------------------------------------
//  drawField(ctx, s, hidden)
// ---------------------------------------------------------------------------
function drawField(ctx, s, hidden) {
  hidden = hidden || new Set();
  const live = BLOCKS.filter(b => !hidden.has(b.id));
  const inGoal = new Set();
  for (const gy of FIELD.LONG_GOAL.y)
    for (const b of live) if (!b.loader && Math.abs(b.y - gy) < 3) inGoal.add(b.id);

  drawWall(ctx);
  drawFloor(ctx, s);
  drawTape(ctx);
  drawParkZone(ctx, 'left');
  drawParkZone(ctx, 'right');
  drawCenterGoal(ctx);

  // painter's order: nearer the centre first, so outward-leaning tops overlap right
  const floorBlocks = live.filter(b => !inGoal.has(b.id) && !b.loader)
    .sort((a, b) => Math.hypot(a.x - 70.2, a.y - 70.2) - Math.hypot(b.x - 70.2, b.y - 70.2));
  for (const b of floorBlocks) drawBlock(ctx, b);

  for (const gy of FIELD.LONG_GOAL.y)
    drawLongGoal(ctx, gy, live.filter(b => !b.loader && Math.abs(b.y - gy) < 3));

  for (const lx of FIELD.LOADER.x) for (const ly of FIELD.LOADER.y)
    drawLoader(ctx, lx, ly, live.filter(b => b.loader && b.x === lx && b.y === ly));
}
