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

  // Loaders: six blocks stacked per tube. The lower three are the alliance
  // colour of that side of the field, the upper three the opposite colour.
  // Right side is blue, left side is red.
  for (const lx of FIELD.LOADER.x) for (const ly of FIELD.LOADER.y) {
    const own = lx > C ? 'blue' : 'red', other = lx > C ? 'red' : 'blue';
    for (let k = 0; k < 6; k++) add(lx, ly, k < 3 ? own : other, { loader: true, stack: k });
  }

  return B;
})();

// ---------------------------------------------------------------------------
//  Palette
// ---------------------------------------------------------------------------
const THEMES = {
  light: {
    wall: '#b9bec6', wallTop: '#d6dbe2',
    tileA: '#989ea6', tileB: '#8f959d',
    seam: 'rgba(48,54,62,0.24)', seamHi: 'rgba(255,255,255,0.09)',
    tape: 'rgba(250,251,253,0.70)',
    glass: 'rgba(226,232,240,0.46)', glassEdge: 'rgba(58,68,80,0.55)',
    glassSide: 'rgba(168,178,190,0.80)', glassHi: 'rgba(255,255,255,0.75)',
    slot: 'rgba(78,88,101,0.38)',
    tubeSide: '#9aa4b2', tubeGlass: 'rgba(238,243,249,0.14)', tubeTop: 'rgba(214,223,233,0.55)',
    bolt: 'rgba(40,46,54,0.55)',
    strut: '#e0892d', strutSide: '#a8621b',
    red: '#d9283c', redSide: '#8e1a27', blue: '#2492e6', blueSide: '#155f9a',
    shadow: 'rgba(20,24,30,1)',
  },
  dark: {
    wall: '#363b43', wallTop: '#474d56',
    tileA: '#7a8088', tileB: '#70767e',
    seam: 'rgba(15,18,23,0.36)', seamHi: 'rgba(255,255,255,0.07)',
    tape: 'rgba(245,248,252,0.68)',
    glass: 'rgba(208,218,230,0.40)', glassEdge: 'rgba(16,20,26,0.62)',
    glassSide: 'rgba(128,140,154,0.78)', glassHi: 'rgba(255,255,255,0.60)',
    slot: 'rgba(18,22,28,0.50)',
    tubeSide: '#78838f', tubeGlass: 'rgba(226,234,243,0.12)', tubeTop: 'rgba(186,197,210,0.50)',
    bolt: 'rgba(10,13,17,0.6)',
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

// ---------------------------------------------------------------------------
//  Park zone: one continuous bracket, open toward the wall, standing 1 in off
//  the floor. Drawn from the spec sheet -- 16.86 x 18.87 in overall, 2.00 in
//  bar, rounded on the two field-side corners, with the bolt heads that hold
//  it down. Traced as a single outline rather than three overlapping bars, so
//  the inside corners meet cleanly.
// ---------------------------------------------------------------------------
function parkBracket(isLeft) {
  const pk = FIELD.PARK, b = pk.bar, r = 2.6;
  const D = pk.depth, H = pk.height;
  const x0 = isLeft ? 0 : FIELD.SIZE - D, y0 = FIELD.CENTER - H / 2;
  // local u runs from the wall toward the field; mirror it for the right side
  const U = (u) => isLeft ? x0 + u : x0 + D - u;

  const arc = (cu, cv, a0, a1) => {
    const out = [];
    for (let k = 0; k <= 6; k++) {
      const a = a0 + (a1 - a0) * k / 6;
      out.push({ x: U(cu + r * Math.cos(a) * (isLeft ? 1 : 1)), y: y0 + cv + r * Math.sin(a) });
    }
    return out;
  };

  const pts = [{ x: U(0), y: y0 }];
  pts.push({ x: U(D - r), y: y0 });
  pts.push(...arc(D - r, r, -Math.PI / 2, 0));
  pts.push({ x: U(D), y: y0 + H - r });
  pts.push(...arc(D - r, H - r, 0, Math.PI / 2));
  pts.push({ x: U(0), y: y0 + H });
  pts.push({ x: U(0), y: y0 + H - b });
  pts.push({ x: U(D - b), y: y0 + H - b });
  pts.push({ x: U(D - b), y: y0 + b });
  pts.push({ x: U(0), y: y0 + b });
  return { pts, x0, y0, D, H, b, U };
}

function drawParkZone(ctx, side) {
  const pk = FIELD.PARK, isLeft = side === 'left';
  const col = isLeft ? P.red : P.blue, sideCol = isLeft ? P.redSide : P.blueSide;
  const { pts, y0, D, H, b, U } = parkBracket(isLeft);

  withShadow(ctx, 3, c => pathOf(c, pts));
  const top = drawPrism(ctx, pts, 0, pk.thick, sideCol, col, 'rgba(0,0,0,0.22)');

  const { dx, dy } = shiftOf(pts, pk.thick);
  ctx.save();
  pathOf(ctx, top); ctx.clip();

  // a lit edge along the inside of each bar
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(U(0) + dx - (isLeft ? 0 : D), y0 + b - 0.3 + dy, D, 0.3);
  ctx.fillRect(U(0) + dx - (isLeft ? 0 : D), y0 + H - b + dy, D, 0.3);

  // bolt heads, as on the drawing: both ends of each rail plus the mid-span
  ctx.fillStyle = P.bolt;
  const bolts = [[b / 2, b / 2], [D - b / 2, b / 2], [b / 2, H - b / 2],
                 [D - b / 2, H - b / 2], [D - b / 2, H / 2]];
  for (const [u, v] of bolts) {
    ctx.beginPath(); ctx.arc(U(u) + dx, y0 + v + dy, 0.42, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Block. `z0` lets a block sit on top of others, which is what the loader
//  stacks need: without it the whole tube's worth of displacement shows up as
//  an exposed dark base and the top block looks black.
// ---------------------------------------------------------------------------
function drawBlock(ctx, b, alpha, z0, sizeScale) {
  const S = FIELD.BLOCK.size * (sizeScale || 1), lo = z0 || 0, hi = lo + FIELD.BLOCK.height;
  const col = b.color === 'red' ? P.red : P.blue, sideCol = b.color === 'red' ? P.redSide : P.blueSide;
  const base = octPts(b.x, b.y, S);

  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  if (!lo) withShadow(ctx, FIELD.BLOCK.height, c => pathOf(c, base));
  // The outline is firm rather than a hairline: in a loader tube the blocks
  // overlap almost completely, and the edges are the only way to count them.
  const top = drawPrism(ctx, base, lo, hi, sideCol, col, 'rgba(0,0,0,0.32)');
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
  // The centre band is translucent: solid orange over the middle of the bar
  // hides the blocks sitting on the floor underneath, and it is exactly that
  // show-through which tells you the bar is above them.
  ctx.save(); ctx.globalAlpha = 0.45;
  ctx.fillRect(px + L / 2 - g.band / 2, py, g.band, W);
  ctx.restore();

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

  const paintArm = (ang, H, dim) => {
    const plate = armPlate(ang);
    const top = drawPrism(ctx, plate, 0, H, P.glassSide, P.glass, P.glassEdge);
    ctx.save();
    pathOf(ctx, top); ctx.clip();
    const { dx, dy } = shiftOf(plate, H);
    ctx.translate(C + dx, C + dy); ctx.rotate(ang * Math.PI / 180);
    ctx.fillStyle = P.slot;    ctx.fillRect(-L / 2, -cg.slot / 2, L, cg.slot);
    ctx.fillStyle = P.glassHi; ctx.fillRect(-L / 2 + 0.8, -cg.width / 2 + cg.width * 0.13, L - 1.6, 0.28);
    ctx.restore();
    if (dim) {                       // the lower arm sits in the upper one's light
      ctx.save(); ctx.globalAlpha = dim; ctx.fillStyle = P.shadow;
      pathOf(ctx, top); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.16; pathOf(ctx, top); ctx.stroke();
    return top;
  };

  const lowTop = paintArm(lower, cg.heightLower, 0.14);

  // the upper arm's shadow, falling across the lower one
  ctx.save();
  pathOf(ctx, lowTop); ctx.clip();
  ctx.globalAlpha = 0.40; ctx.fillStyle = P.shadow;
  ctx.translate(1.0, -1.0);
  pathOf(ctx, armPlate(upper)); ctx.fill();
  ctx.restore();

  const upTop = paintArm(upper, cg.heightUpper, 0);

  // a bright rim along the upper arm makes which one is on top unmissable
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.80)'; ctx.lineWidth = 0.34;
  pathOf(ctx, upTop); ctx.stroke();
  ctx.restore();

  const hub = shiftPts(circlePts(C, C, 1.5, 16), cg.heightUpper);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; pathOf(ctx, hub); ctx.fill();
}

// Outline of a cylinder seen from above and to one side: the convex hull of
// its base circle and its displaced top circle. Andrew's monotone chain.
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ---------------------------------------------------------------------------
//  Loader: a clear tube standing 21 in tall with an orange collar.
//
//  The tube body is drawn as a solid, then the blocks, then a translucent
//  overlay -- so the blocks read as being INSIDE the tube rather than painted
//  on the floor, and the tube itself still reads as a solid object. Drawing
//  the whole thing translucent, as an earlier version did, made the tube
//  disappear entirely: all that was left was the orange collar.
//
//  `blocks` is whatever is LEFT in the tube. They are re-stacked from the
//  bottom rather than sitting at their original heights, so when the intake
//  draws the lower ones out the rest fall, which is what a real stack does.
// ---------------------------------------------------------------------------
function drawLoader(ctx, lx, ly, blocks) {
  const r = FIELD.LOADER.diameter / 2, H = FIELD.LOADER.height;
  const base = circlePts(lx, ly, r);
  const top = shiftPts(base, H);
  const hull = convexHull(base.concat(top));

  withShadow(ctx, H, c => pathOf(c, hull));

  ctx.fillStyle = P.tubeSide; pathOf(ctx, hull); ctx.fill();          // solid body

  // A block is 3.23 in across in a 4.17 in tube, so it very nearly fills it and
  // is drawn close to true size. Six of them span 21 in of HEIGHT, which from
  // overhead is only about 0.6 in of visual separation each -- so they overlap
  // almost entirely and read as one packed column, exactly as in the official
  // render. The count is still legible two ways: the firm outline on each
  // block, and the column growing visibly shorter as the intake empties it.
  ctx.save();
  pathOf(ctx, hull); ctx.clip();
  const left = (blocks || []).slice().sort((a, b) => a.stack - b.stack);
  left.forEach((b, k) => drawBlock(ctx, b, 1, 1.0 + k * 3.32, 0.90));  // gravity
  ctx.restore();

  ctx.fillStyle = P.tubeGlass; pathOf(ctx, hull); ctx.fill();         // plastic over them
  ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.22; pathOf(ctx, hull); ctx.stroke();

  // a highlight running the length of the tube, offset across its axis
  const c0 = centroid(base), c1 = centroid(top);
  const ax = c1.x - c0.x, ay = c1.y - c0.y, len = Math.hypot(ax, ay) || 1;
  const nx = -ay / len * r * 0.45, ny = ax / len * r * 0.45;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(c0.x + nx, c0.y + ny); ctx.lineTo(c1.x + nx, c1.y + ny);
  ctx.stroke();

  // where it meets the floor
  ctx.strokeStyle = 'rgba(30,36,44,0.35)'; ctx.lineWidth = 0.18;
  pathOf(ctx, base); ctx.stroke();

  // open top, then the orange collar
  ctx.fillStyle = P.tubeTop;     pathOf(ctx, top); ctx.fill();
  ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.2; pathOf(ctx, top); ctx.stroke();

  ctx.strokeStyle = P.strutSide; ctx.lineWidth = r * 0.48;
  ctx.beginPath(); ctx.arc(c1.x, c1.y - 0.3, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.strut; ctx.lineWidth = r * 0.42;
  ctx.beginPath(); ctx.arc(c1.x, c1.y, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.glassHi; ctx.lineWidth = r * 0.13;
  ctx.beginPath(); ctx.arc(c1.x, c1.y, r * 0.93, Math.PI * 0.62, Math.PI * 1.18); ctx.stroke();
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
