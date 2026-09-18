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
//      the way a camera above the centre of the field would see it: the top of
//      a tall object is displaced radially outward, in proportion to its
//      height, and the side faces that this exposes are drawn. The floor
//      contact -- the thing a robot can hit -- never moves. So the picture
//      reads as three-dimensional while every measurement stays exact.
// ============================================================================

const FIELD = {
  SIZE: 140.4,                // playing floor, wall face to wall face
  CENTER: 70.2,
  TILE: 140.4 / 6,            // 23.4 in
  WALL_THICKNESS: 2.2,

  LONG_GOAL:   { length: 48.79, width: 5.53, height: 12.67, y: [23.44, 116.97], legWidth: 5.87 },
  CENTER_GOAL: { arm: 22.60, width: 4.00, height: 12.54 },
  LOADER:      { diameter: 4.17, height: 21.34, x: [2.58, 137.87], y: [23.44, 116.97] },
  PARK:        { depth: 16.86, height: 18.87, bar: 2.00, thick: 1.00 },
  BLOCK:       { size: 3.23, diagonal: 3.84, height: 3.23 },
};

// Virtual camera height above the field centre, inches. Larger = flatter.
// This number only affects how much tall objects LEAN; footprints never move.
const CAM_HEIGHT = 300;

// Where the top of an object standing `h` inches tall appears.
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
  const add = (x, y, color) => B.push({ id: id++, x, y, color });
  const mirrorX = (x) => 140.43 - x;

  // Long goal troughs, 4 each                              [confirmed by tick pitch]
  for (const gy of FIELD.LONG_GOAL.y)
    [65.38, 68.61, 71.84, 75.07].forEach((x, i) => add(x, gy, i < 2 ? 'red' : 'blue'));

  // Park zones, 4 stacked                                  [confirmed by tick pitch]
  for (const y of [65.36, 68.59, 71.82, 75.05]) { add(14.03, y, 'blue'); add(mirrorX(14.03), y, 'red'); }

  // Corner pairs hard against the top and bottom walls     [confirmed by tick pitch]
  for (const [x0, x1] of [[21.46, 24.69], [mirrorX(24.69), mirrorX(21.46)]]) {
    const col = x0 < C ? 'blue' : 'red';
    add(x0, 138.80, col); add(x1, 138.80, col);
    add(x0, 1.61,   col); add(x1, 1.61,   col);
  }

  // Four L-shaped clusters around the centre goal          [from the official render]
  // The corner block sits exactly on a tile-seam intersection (two tiles in
  // from each wall); the other two lie along the seams, edge to edge, pointing
  // toward the field centre. Mirrored in both axes.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = C + sx * T, cy = C + sy * T;      // seam intersection
      const col = sx < 0 ? 'red' : 'blue';
      add(cx,          cy,          col);          // corner, on the intersection
      add(cx - sx * S, cy,          col);          // along the horizontal seam, inward
      add(cx,          cy - sy * S, col);          // along the vertical seam, inward
    }
  }

  // One block visible in each loader                       [estimated]
  for (const lx of FIELD.LOADER.x)
    for (const ly of FIELD.LOADER.y)
      add(lx, ly, (lx < C) === (ly > C) ? 'blue' : 'red');

  return B;
})();

// ---------------------------------------------------------------------------
//  Palette
// ---------------------------------------------------------------------------
const THEMES = {
  light: {
    wall: '#b9bec6', wallTop: '#d6dbe2',
    tileA: '#989ea6', tileB: '#8f959d', grain: 'rgba(255,255,255,0.05)',
    seam: 'rgba(40,45,52,0.32)',
    tape: 'rgba(250,251,253,0.70)',
    glass: 'rgba(225,231,238,0.34)', glassEdge: 'rgba(60,70,82,0.55)',
    glassSide: 'rgba(150,160,172,0.38)', glassHi: 'rgba(255,255,255,0.55)',
    strut: '#e0892d', strutSide: '#a8621b',
    red: '#d9283c', redSide: '#8e1a27', blue: '#2492e6', blueSide: '#155f9a',
    shadow: 'rgba(20,24,30,1)',
  },
  dark: {
    wall: '#363b43', wallTop: '#474d56',
    tileA: '#7a8088', tileB: '#70767e', grain: 'rgba(255,255,255,0.045)',
    seam: 'rgba(15,18,23,0.45)',
    tape: 'rgba(245,248,252,0.68)',
    glass: 'rgba(215,222,230,0.30)', glassEdge: 'rgba(20,24,30,0.6)',
    glassSide: 'rgba(120,130,142,0.40)', glassHi: 'rgba(255,255,255,0.45)',
    strut: '#d9822b', strutSide: '#96581a',
    red: '#e0243c', redSide: '#8c1625', blue: '#2196f3', blueSide: '#125b95',
    shadow: 'rgba(0,0,0,1)',
  },
};
let P = THEMES.light;
function setTheme(name) { P = THEMES[name] || THEMES.light; }

// ---------------------------------------------------------------------------
//  Shadow: the same shape stamped at a few small offsets. Explicit rather than
//  ctx.shadowBlur, which misbehaves under a flipped, scaled transform.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
//  Extrusion: base polygon at true position, top polygon lifted by `h`, with
//  the side faces that face away from the field centre filled in between.
//  Inward-facing sides are hidden under the top and are not drawn.
// ---------------------------------------------------------------------------
function extrudePoly(ctx, pts, h, sideFill, topFill, topStroke) {
  const n = pts.length;
  const top = pts.map(p => lift(p.x, p.y, h));
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x / n; cy += p.y / n; }

  ctx.fillStyle = sideFill;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let nx = b.y - a.y, ny = -(b.x - a.x);                   // a normal of edge ab
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }   // make it outward
    if (nx * (mx - FIELD.CENTER) + ny * (my - FIELD.CENTER) <= 0) continue;  // faces camera? no
    const A = top[i], B = top[(i + 1) % n];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(B.x, B.y); ctx.lineTo(A.x, A.y);
    ctx.closePath(); ctx.fill();
  }

  ctx.beginPath();
  top.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  if (topFill)   { ctx.fillStyle = topFill; ctx.fill(); }
  if (topStroke) { ctx.strokeStyle = topStroke; ctx.lineWidth = 0.14; ctx.stroke(); }
  return top;
}

const rectPts = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
function circlePts(cx, cy, r, n = 28) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return out;
}
function octPts(x, y, size) {
  const h = size / 2, k = h * 0.414;
  return [{ x: x - h + k, y: y - h }, { x: x + h - k, y: y - h }, { x: x + h, y: y - h + k }, { x: x + h, y: y + h - k },
          { x: x + h - k, y: y + h }, { x: x - h + k, y: y + h }, { x: x - h, y: y + h - k }, { x: x - h, y: y - h + k }];
}
function pathOf(ctx, pts) {
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
}

// ---------------------------------------------------------------------------
//  Floor. Adjacent tiles are moulded with their grain at 90 degrees to each
//  other; that alternation, not a colour difference, is the checkerboard.
// ---------------------------------------------------------------------------
function drawFloor(ctx, s) {
  const T = FIELD.TILE, N = 6;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const vertical = (i + j) % 2 === 0;
    ctx.fillStyle = vertical ? P.tileA : P.tileB;
    ctx.fillRect(i * T, j * T, T, T);
    if (s > 3) {
      ctx.save();
      ctx.beginPath(); ctx.rect(i * T, j * T, T, T); ctx.clip();
      ctx.strokeStyle = P.grain; ctx.lineWidth = 0.22;
      ctx.beginPath();
      for (let k = 0.45; k < T; k += 0.9) {
        if (vertical) { ctx.moveTo(i * T + k, j * T); ctx.lineTo(i * T + k, j * T + T); }
        else          { ctx.moveTo(i * T, j * T + k); ctx.lineTo(i * T + T, j * T + k); }
      }
      ctx.stroke(); ctx.restore();
    }
  }
  ctx.strokeStyle = P.seam; ctx.lineWidth = Math.max(0.12, 1.3 / s);
  ctx.beginPath();
  for (let i = 1; i < N; i++) { ctx.moveTo(i * T, 0); ctx.lineTo(i * T, FIELD.SIZE); ctx.moveTo(0, i * T); ctx.lineTo(FIELD.SIZE, i * T); }
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
  ctx.fillStyle = P.wall;
  ctx.fillRect(-W, -W, S + 2 * W, S + 2 * W);
  ctx.fillStyle = P.wallTop;
  ctx.fillRect(-W, S + W * 0.45, S + 2 * W, W * 0.55);
  ctx.fillRect(-W, -W, W * 0.55, S + 2 * W);
  ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = P.shadow;
  ctx.fillRect(0, S - 1.5, S, 1.5); ctx.fillRect(0, 0, 1.5, S);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Park zone: 2 in bars, 1 in tall, open toward the wall.
// ---------------------------------------------------------------------------
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
  for (const bar of bars) extrudePoly(ctx, bar, pk.thick, sideCol, col, null);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (const bar of bars) { const t = bar.map(p => lift(p.x, p.y, pk.thick)); ctx.fillRect(t[3].x, t[3].y - 0.4, t[2].x - t[3].x, 0.4); }
}

// ---------------------------------------------------------------------------
//  Block: octagon, dark body at the footprint, lifted lighter top, highlight.
// ---------------------------------------------------------------------------
function drawBlock(ctx, b, alpha) {
  const S = FIELD.BLOCK.size;
  const col = b.color === 'red' ? P.red : P.blue, sideCol = b.color === 'red' ? P.redSide : P.blueSide;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  withShadow(ctx, FIELD.BLOCK.height, c => pathOf(c, octPts(b.x, b.y, S)));
  const top = extrudePoly(ctx, octPts(b.x, b.y, S), FIELD.BLOCK.height, sideCol, col, null);
  // inset top face + highlight
  const tc = lift(b.x, b.y, FIELD.BLOCK.height);
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; pathOf(ctx, octPts(tc.x, tc.y, S * 0.92)); ctx.fill();
  ctx.fillStyle = col;                pathOf(ctx, octPts(tc.x, tc.y, S * 0.80)); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; pathOf(ctx, octPts(tc.x - S * 0.05, tc.y + S * 0.05, S * 0.42)); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Long goal: two orange legs standing full height, a clear trough between
//  them, and the four blocks on the floor beneath showing straight through.
// ---------------------------------------------------------------------------
function drawLongGoal(ctx, gy, blocks) {
  const g = FIELD.LONG_GOAL, C = FIELD.CENTER;
  const x0 = C - g.length / 2, w = g.length, h = g.width, y0 = gy - h / 2;

  withShadow(ctx, g.height, c => c.rect(x0, y0, w, h));
  for (const b of blocks) drawBlock(ctx, b);                 // on the floor, full strength

  // legs
  extrudePoly(ctx, rectPts(x0, y0, g.legWidth, h),               g.height, P.strutSide, P.strut, P.glassEdge);
  extrudePoly(ctx, rectPts(x0 + w - g.legWidth, y0, g.legWidth, h), g.height, P.strutSide, P.strut, P.glassEdge);

  // clear trough: translucent sides, translucent top
  const top = extrudePoly(ctx, rectPts(x0, y0, w, h), g.height, P.glassSide, P.glass, P.glassEdge);

  // central orange band on the top, and a specular streak along it
  const tl = top[3], tr = top[2], bl = top[0];
  const tw = tr.x - tl.x, th = tl.y - bl.y;
  ctx.fillStyle = P.strut; ctx.fillRect(tl.x + tw / 2 - 3.0, bl.y, 6.0, th);
  ctx.fillStyle = P.glassHi; ctx.fillRect(tl.x + g.legWidth + 1, bl.y + th * 0.68, tw - 2 * g.legWidth - 2, th * 0.10);
}

// ---------------------------------------------------------------------------
//  Centre goal: two crossed clear arms on an orange hub.
// ---------------------------------------------------------------------------
function drawCenterGoal(ctx) {
  const cg = FIELD.CENTER_GOAL, C = FIELD.CENTER;
  const arm = (a) => {
    const ca = Math.cos(a), sa = Math.sin(a), L = cg.arm, W = cg.width / 2;
    return [[-L, -W], [L, -W], [L, W], [-L, W]].map(([u, v]) => ({ x: C + u * ca - v * sa, y: C + u * sa + v * ca }));
  };
  for (const a of [Math.PI / 4, -Math.PI / 4]) withShadow(ctx, cg.height, c => pathOf(c, arm(a)));
  for (const a of [Math.PI / 4, -Math.PI / 4]) extrudePoly(ctx, arm(a), cg.height, P.glassSide, P.glass, P.glassEdge);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const t = arm(a).map(p => lift(p.x, p.y, cg.height));
    ctx.strokeStyle = P.glassHi; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo((t[0].x * 0.7 + t[3].x * 0.3), (t[0].y * 0.7 + t[3].y * 0.3)); ctx.lineTo((t[1].x * 0.7 + t[2].x * 0.3), (t[1].y * 0.7 + t[2].y * 0.3)); ctx.stroke();
  }
  extrudePoly(ctx, circlePts(C, C, 2.6, 20), cg.height, P.strutSide, P.strut, null);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(C - 0.6, C + 0.6, 1.1, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------------------
//  Loader: a clear tube 21 in tall with an orange collar, block visible inside.
// ---------------------------------------------------------------------------
function drawLoader(ctx, lx, ly, block) {
  const r = FIELD.LOADER.diameter / 2, H = FIELD.LOADER.height;
  withShadow(ctx, H, c => { c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2); });
  if (block) drawBlock(ctx, block);
  extrudePoly(ctx, circlePts(lx, ly, r), H, P.glassSide, P.glass, P.glassEdge);
  const t = lift(lx, ly, H);
  ctx.strokeStyle = P.strutSide; ctx.lineWidth = r * 0.46;
  ctx.beginPath(); ctx.arc(t.x, t.y - 0.25, r * 0.80, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.strut; ctx.lineWidth = r * 0.40;
  ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.80, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.glassHi; ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.92, Math.PI * 0.6, Math.PI * 1.2); ctx.stroke();
}

// ---------------------------------------------------------------------------
//  drawField(ctx, s, hidden) -- inches, y already flipped by the caller.
//  `hidden` is a Set of block ids to omit (blocks the robot has collected).
// ---------------------------------------------------------------------------
function drawField(ctx, s, hidden) {
  hidden = hidden || new Set();
  const live = BLOCKS.filter(b => !hidden.has(b.id));
  const inGoal = new Set();
  for (const gy of FIELD.LONG_GOAL.y) for (const b of live) if (Math.abs(b.y - gy) < 3) inGoal.add(b.id);
  for (const lx of FIELD.LOADER.x) for (const ly of FIELD.LOADER.y) for (const b of live) if (Math.hypot(b.x - lx, b.y - ly) < 2.5) inGoal.add(b.id);

  drawWall(ctx);
  drawFloor(ctx, s);
  drawTape(ctx);
  drawParkZone(ctx, 'left');
  drawParkZone(ctx, 'right');

  // painter's order: things nearer the centre first, so outward-leaning tops
  // of far objects overlap correctly
  const floorBlocks = live.filter(b => !inGoal.has(b.id))
    .sort((a, b) => Math.hypot(a.x - 70.2, a.y - 70.2) - Math.hypot(b.x - 70.2, b.y - 70.2));
  drawCenterGoal(ctx);
  for (const b of floorBlocks) drawBlock(ctx, b);
  for (const gy of FIELD.LONG_GOAL.y) drawLongGoal(ctx, gy, live.filter(b => Math.abs(b.y - gy) < 3));
  for (const lx of FIELD.LOADER.x) for (const ly of FIELD.LOADER.y)
    drawLoader(ctx, lx, ly, live.find(b => Math.hypot(b.x - lx, b.y - ly) < 2.5));
}
