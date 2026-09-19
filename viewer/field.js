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
//      the way a camera above the centre of the field sees it: the top of a
//      tall object is displaced outward in proportion to its height. The floor
//      contact -- the thing a robot can hit -- never moves, so the picture
//      reads as three-dimensional while every measurement stays exact.
// ============================================================================

const FIELD = {
  SIZE: 140.4,
  CENTER: 70.2,
  TILE: 140.4 / 6,            // 23.4 in
  WALL_THICKNESS: 2.2,

  // Long Goal: 48.79 in overall (legs included) x 5.53 in wide, 12.67 in tall.
  // Centre lines y = 23.44 / 116.97; the span 45.83..94.62 matches the ticks.
  LONG_GOAL: { length: 48.79, width: 5.53, height: 12.67, y: [23.44, 116.97],
               legWidth: 5.87, slot: 1.95 },

  // Centre Goal: 573.99 mm = 22.60 in is the FULL tip-to-tip length of each
  // diagonal, so each arm reaches 11.30 in from the centre. That puts the tips
  // at 70.2 +/- 7.99 = 62.21 / 78.19, which is exactly where the reference
  // drawing's 62.22 and 78.19 tick marks sit. (Reading 22.60 as a half-length
  // would push the tips out to 86 in, which those ticks rule out.)
  //
  // The two arms sit at different heights -- the drawing calls them UPPER and
  // LOWER. The upper-left to lower-right arm is the high one.
  CENTER_GOAL: { arm: 11.30, width: 4.00, slot: 1.95,
                 heightUpper: 12.54, heightLower: 10.77, upperAng: -45 },

  LOADER: { diameter: 4.17, height: 21.34, x: [2.58, 137.87], y: [23.44, 116.97] },
  PARK:   { depth: 16.86, height: 18.87, bar: 2.00, thick: 1.00 },
  BLOCK:  { size: 3.23, diagonal: 3.84, height: 3.23 },
};

// Virtual camera height above the field centre, inches. Larger = flatter.
// Only affects how much tall objects lean; footprints never move.
const CAM_HEIGHT = 300;
function lift(x, y, h) {
  const k = h / CAM_HEIGHT;
  return { x: x + (x - FIELD.CENTER) * k, y: y + (y - FIELD.CENTER) * k };
}

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

  // Four L clusters around the centre goal. The corner block sits on a tile
  // seam intersection two tiles from the centre; the other two run along the
  // seams, edge to edge, pointing inward.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = C + sx * T, cy = C + sy * T, col = sx < 0 ? 'red' : 'blue';
    add(cx,          cy,          col);
    add(cx - sx * S, cy,          col);
    add(cx,          cy - sy * S, col);
  }

  // Loaders: three blocks stacked in each tube.
  // Right side: lower tube blue, upper tube red. Left side mirrors it.
  const loaderColor = (lx, ly) => {
    const right = lx > C, lower = ly < C;
    if (right) return lower ? 'blue' : 'red';
    return lower ? 'red' : 'blue';
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
    seam: 'rgba(48,54,62,0.38)', seamHi: 'rgba(255,255,255,0.13)',
    tape: 'rgba(250,251,253,0.70)',
    glass: 'rgba(222,229,237,0.62)', glassEdge: 'rgba(52,62,74,0.60)',
    glassSide: 'rgba(158,168,180,0.72)', glassHi: 'rgba(255,255,255,0.70)',
    slot: 'rgba(72,82,95,0.45)',
    strut: '#e0892d', strutSide: '#a8621b',
    red: '#d9283c', redSide: '#8e1a27', blue: '#2492e6', blueSide: '#155f9a',
    shadow: 'rgba(20,24,30,1)',
  },
  dark: {
    wall: '#363b43', wallTop: '#474d56',
    tileA: '#7a8088', tileB: '#70767e',
    seam: 'rgba(15,18,23,0.50)', seamHi: 'rgba(255,255,255,0.10)',
    tape: 'rgba(245,248,252,0.68)',
    glass: 'rgba(206,216,228,0.52)', glassEdge: 'rgba(16,20,26,0.65)',
    glassSide: 'rgba(120,132,146,0.70)', glassHi: 'rgba(255,255,255,0.58)',
    slot: 'rgba(18,22,28,0.55)',
    strut: '#d9822b', strutSide: '#96581a',
    red: '#e0243c', redSide: '#8c1625', blue: '#2196f3', blueSide: '#125b95',
    shadow: 'rgba(0,0,0,1)',
  },
};
let P = THEMES.light;
function setTheme(name) { P = THEMES[name] || THEMES.light; }

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function pathOf(ctx, pts) {
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
}
function liftAll(pts, h) { return pts.map(p => lift(p.x, p.y, h)); }

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

// Draw the side wall between a footprint polygon and its lifted top. Only the
// faces pointing away from the field centre are visible from the camera.
function drawSides(ctx, base, h, fill) {
  const top = liftAll(base, h), n = base.length;
  let cx = 0, cy = 0;
  for (const p of base) { cx += p.x / n; cy += p.y / n; }
  ctx.fillStyle = fill;
  for (let i = 0; i < n; i++) {
    const a = base[i], b = base[(i + 1) % n];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let nx = b.y - a.y, ny = -(b.x - a.x);
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    if (nx * (mx - FIELD.CENTER) + ny * (my - FIELD.CENTER) <= 0) continue;
    const A = top[i], B = top[(i + 1) % n];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(B.x, B.y); ctx.lineTo(A.x, A.y);
    ctx.closePath(); ctx.fill();
  }
  return top;
}

// Octagon across the flats, matching the block profile.
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

// A goal bar seen from above: a long faceted plate with chamfered ends and a
// narrow slot running down the centreline. That slot is not decoration -- it is
// the opening the descore hook drops into.
function barPlate(cx, cy, len, wid, angDeg, chamfer) {
  const a = angDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const L = len / 2, W = wid / 2, c = Math.min(chamfer, W * 0.8);
  const local = [
    [-L,       -W + c], [-L + c,   -W], [ L - c,   -W], [ L,       -W + c],
    [ L,        W - c], [ L - c,    W], [-L + c,    W], [-L,        W - c],
  ];
  return local.map(([u, v]) => ({ x: cx + u * ca - v * sa, y: cy + u * sa + v * ca }));
}
function barRails(cx, cy, len, wid, slot, angDeg, chamfer) {
  const a = angDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const L = len / 2, W = wid / 2, s = slot / 2, c = Math.min(chamfer, (W - s) * 0.8);
  const mk = (v0, v1) => [[-L, v0 + c], [-L + c, v0], [L - c, v0], [L, v0 + c], [L, v1], [-L, v1]]
    .map(([u, v]) => ({ x: cx + u * ca - v * sa, y: cy + u * sa + v * ca }));
  return [mk(-W, -s), mk(W, s).reverse()];
}

// ---------------------------------------------------------------------------
//  Floor. No printed grain -- the only thing a real field shows at this scale
//  is the interlocking teeth where two tiles meet, so that is all that is drawn.
// ---------------------------------------------------------------------------
const TOOTH = { period: 2.34, depth: 0.42 };

function toothedSeam(ctx, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const n = Math.round(len / TOOTH.period), step = len / n, d = TOOTH.depth / 2;
  ctx.moveTo(x0, y0);
  for (let i = 0; i < n; i++) {
    const s = (i % 2 === 0) ? d : -d;
    const a0 = i * step, a1 = (i + 1) * step;
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
  const lw = Math.max(0.1, 1.2 / s);
  // a light side first, then the dark seam, so the join reads as a real edge
  ctx.strokeStyle = P.seamHi; ctx.lineWidth = lw * 2.2;
  ctx.beginPath();
  for (let i = 1; i < N; i++) {
    if (s > 2.5) { toothedSeam(ctx, i * T, 0, i * T, FIELD.SIZE); toothedSeam(ctx, 0, i * T, FIELD.SIZE, i * T); }
    else { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, FIELD.SIZE); ctx.moveTo(0, i * T); ctx.lineTo(FIELD.SIZE, i * T); }
  }
  ctx.stroke();
  ctx.strokeStyle = P.seam; ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 1; i < N; i++) {
    if (s > 2.5) { toothedSeam(ctx, i * T, 0, i * T, FIELD.SIZE); toothedSeam(ctx, 0, i * T, FIELD.SIZE, i * T); }
    else { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, FIELD.SIZE); ctx.moveTo(0, i * T); ctx.lineTo(FIELD.SIZE, i * T); }
  }
  ctx.stroke();
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
  for (const bar of bars) {
    const top = drawSides(ctx, bar, pk.thick, sideCol);
    ctx.fillStyle = col; pathOf(ctx, top); ctx.fill();
  }
}

// ---------------------------------------------------------------------------
//  Block. Drawn as a dark footprint with a bright lifted top: a low extrusion
//  needs no face culling, which is what used to make the odd block go dark.
// ---------------------------------------------------------------------------
function drawBlock(ctx, b, alpha, heightOverride) {
  const S = FIELD.BLOCK.size, H = heightOverride === undefined ? FIELD.BLOCK.height : heightOverride;
  const col = b.color === 'red' ? P.red : P.blue, sideCol = b.color === 'red' ? P.redSide : P.blueSide;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  withShadow(ctx, H, c => pathOf(c, octPts(b.x, b.y, S)));
  ctx.fillStyle = sideCol; pathOf(ctx, octPts(b.x, b.y, S)); ctx.fill();
  const t = lift(b.x, b.y, H);
  ctx.fillStyle = col; pathOf(ctx, octPts(t.x, t.y, S)); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)'; pathOf(ctx, octPts(t.x - S * 0.055, t.y + S * 0.055, S * 0.44)); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.1;
  pathOf(ctx, octPts(t.x, t.y, S)); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Long goal: orange legs at each end, a clear faceted trough between them
//  with a slot down the middle, and the four blocks on the floor beneath.
// ---------------------------------------------------------------------------
function drawLongGoal(ctx, gy, blocks) {
  const g = FIELD.LONG_GOAL, C = FIELD.CENTER;
  const x0 = C - g.length / 2, w = g.length, h = g.width, y0 = gy - h / 2;

  withShadow(ctx, g.height, c => c.rect(x0, y0, w, h));
  for (const b of blocks) drawBlock(ctx, b);            // on the floor, under the bridge

  for (const lx of [x0, x0 + w - g.legWidth]) {
    const base = rectPts(lx, y0, g.legWidth, h);
    const top = drawSides(ctx, base, g.height, P.strutSide);
    ctx.fillStyle = P.strut; pathOf(ctx, top); ctx.fill();
  }

  const plate = barPlate(C, gy, w - 2 * g.legWidth, h, 0, 1.3);
  drawSides(ctx, plate, g.height, P.glassSide);
  const rails = barRails(C, gy, w - 2 * g.legWidth, h, g.slot, 0, 1.3);
  for (const r of rails) {
    const top = liftAll(r, g.height);
    ctx.fillStyle = P.glass;     pathOf(ctx, top); ctx.fill();
    ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.14; pathOf(ctx, top); ctx.stroke();
  }
  // the slot between the rails
  const t = lift(C, gy, g.height);
  ctx.fillStyle = P.slot;
  ctx.fillRect(t.x - (w - 2 * g.legWidth) / 2, t.y - g.slot / 2, w - 2 * g.legWidth, g.slot);
  // specular streak along the near rail
  ctx.fillStyle = P.glassHi;
  ctx.fillRect(t.x - (w - 2 * g.legWidth) / 2 + 1, t.y - h / 2 + h * 0.13, w - 2 * g.legWidth - 2, 0.32);
}

// ---------------------------------------------------------------------------
//  Centre goal: two crossed faceted arms at DIFFERENT heights, each slotted
//  like the long goals. The lower one is drawn first so the upper reads as
//  passing over it.
// ---------------------------------------------------------------------------
function drawCenterGoal(ctx) {
  const cg = FIELD.CENTER_GOAL, C = FIELD.CENTER, L = cg.arm * 2;

  for (const ang of [cg.upperAng + 90, cg.upperAng]) {          // lower first
    const H = ang === cg.upperAng ? cg.heightUpper : cg.heightLower;
    withShadow(ctx, H, c => pathOf(c, barPlate(C, C, L, cg.width, ang, 1.1)));
  }

  // orange centre bracing, under both arms
  const brace = drawSides(ctx, circlePts(C, C, 2.3, 18), cg.heightLower - 1.2, P.strutSide);
  ctx.fillStyle = P.strut; pathOf(ctx, brace); ctx.fill();

  for (const ang of [cg.upperAng + 90, cg.upperAng]) {
    const H = ang === cg.upperAng ? cg.heightUpper : cg.heightLower;
    const plate = barPlate(C, C, L, cg.width, ang, 1.1);
    drawSides(ctx, plate, H, P.glassSide);
    for (const r of barRails(C, C, L, cg.width, cg.slot, ang, 1.1)) {
      const top = liftAll(r, H);
      ctx.fillStyle = P.glass;       pathOf(ctx, top); ctx.fill();
      ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.14; pathOf(ctx, top); ctx.stroke();
    }
    // slot, drawn as a thin rotated strip
    const a = ang * Math.PI / 180, t = lift(C, C, H);
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(a);
    ctx.fillStyle = P.slot; ctx.fillRect(-L / 2, -cg.slot / 2, L, cg.slot);
    ctx.fillStyle = P.glassHi; ctx.fillRect(-L / 2 + 1, -cg.width / 2 + cg.width * 0.12, L - 2, 0.3);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
//  Loader: a clear tube 21 in tall with an orange collar. The wall is drawn
//  solidly enough to read as a cylinder without hiding the blocks inside.
// ---------------------------------------------------------------------------
function drawLoader(ctx, lx, ly, blocks) {
  const r = FIELD.LOADER.diameter / 2, H = FIELD.LOADER.height;
  withShadow(ctx, H, c => { c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2); });

  const base = circlePts(lx, ly, r);
  drawSides(ctx, base, H, P.glassSide);                 // the cylinder wall

  // blocks stacked inside, each at its own height so the stack fans outward
  for (const b of (blocks || [])) drawBlock(ctx, b, 0.92, 2 + b.stack * 3.4);

  const top = liftAll(base, H);
  ctx.fillStyle = P.glass;       pathOf(ctx, top); ctx.fill();
  ctx.strokeStyle = P.glassEdge; ctx.lineWidth = 0.16; pathOf(ctx, top); ctx.stroke();

  const t = lift(lx, ly, H);
  ctx.strokeStyle = P.strutSide; ctx.lineWidth = r * 0.48;
  ctx.beginPath(); ctx.arc(t.x, t.y - 0.3, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.strut; ctx.lineWidth = r * 0.42;
  ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.glassHi; ctx.lineWidth = r * 0.13;
  ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.93, Math.PI * 0.62, Math.PI * 1.18); ctx.stroke();
}

// ---------------------------------------------------------------------------
//  drawField(ctx, s, hidden)
// ---------------------------------------------------------------------------
function drawField(ctx, s, hidden) {
  hidden = hidden || new Set();
  const live = BLOCKS.filter(b => !hidden.has(b.id));
  const inGoal = new Set();
  for (const gy of FIELD.LONG_GOAL.y) for (const b of live) if (!b.loader && Math.abs(b.y - gy) < 3) inGoal.add(b.id);

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
