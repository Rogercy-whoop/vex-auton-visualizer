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
//  RENDERING POLICY -- deliberate, and worth understanding:
//      Geometry is strictly orthographic. Nothing is offset for perspective,
//      because this is a measuring tool: a block drawn 2 in from where it
//      really is would quietly corrupt every judgement made from the picture.
//      All the sense of depth comes from shadows, bevels and highlights, which
//      cost nothing in positional accuracy.
// ============================================================================

const FIELD = {
  SIZE: 140.4,                // playing floor, wall face to wall face
  CENTER: 70.2,
  TILE: 140.4 / 6,            // 23.4 in
  WALL_THICKNESS: 2.2,

  // Long Goals: 48.79 in overall x 5.53 in wide, centres at y = 23.44 / 116.97
  LONG_GOAL: { length: 48.79, width: 5.53, height: 12.67, y: [23.44, 116.97],
               legWidth: 5.87 },

  // Centre Goal: arms reach 22.60 in, arm width 4.00 in, 12.54 in tall
  CENTER_GOAL: { arm: 22.60, width: 4.00, height: 12.54 },

  // Loaders: 4.17 in base diameter, 21.34 in tall
  LOADER: { diameter: 4.17, height: 21.34, x: [2.58, 137.87], y: [23.44, 116.97] },

  // Park Zones: 16.86 in deep x 18.87 in tall overall, 2.00 in bar, 1.00 in high
  PARK: { depth: 16.86, height: 18.87, bar: 2.00, thick: 1.00 },

  // Blocks: 82 mm = 3.23 in across flats, 97.632 mm = 3.84 in across corners
  BLOCK: { size: 3.23, diagonal: 3.84, height: 3.23 },
};

// ---------------------------------------------------------------------------
//  Starting block positions.
//
//  CONFIDENCE VARIES, so it is recorded per group:
//    [confirmed]  spacing matches the 3.23 in block pitch exactly against tick
//                 marks on the Field Reference drawing -- these are right.
//    [estimated]  scaled off the official render; correct to about an inch.
//
//  Edit the numbers here to correct the field; no other file needs to change.
// ---------------------------------------------------------------------------
const BLOCKS = (() => {
  const B = [], C = FIELD.CENTER;
  let id = 0;
  const add = (x, y, color) => B.push({ id: id++, x, y, color });
  const mirrorX = (x) => 140.43 - x;
  const mirrorY = (y) => 140.41 - y;

  // --- Long goal troughs: 4 blocks each ------------------- [confirmed] ----
  // x ticks 65.38 / 68.61 / 71.84 / 75.07 are exactly 3.23 apart.
  for (const gy of FIELD.LONG_GOAL.y) {
    const cols = [65.38, 68.61, 71.84, 75.07];
    cols.forEach((x, i) => add(x, gy, i < 2 ? 'red' : 'blue'));
  }

  // --- Park zones: 4 blocks stacked ----------------------- [confirmed] ----
  // y ticks 65.36 / 68.59 / 71.82 / 75.05, also 3.23 apart.
  for (const y of [65.36, 68.59, 71.82, 75.05]) {
    add(14.03,          y, 'blue');   // left (red) park zone holds blue blocks
    add(mirrorX(14.03), y, 'red');
  }

  // --- Corner pairs against the top and bottom walls ------ [confirmed] ----
  // x ticks 21.46 / 24.69 are 3.23 apart; y 138.80 and 1.61 put the blocks
  // hard against the wall (half a block is 1.61).
  for (const [x0, x1] of [[21.46, 24.69], [mirrorX(24.69), mirrorX(21.46)]]) {
    const left = x0 < C;
    add(x0, 138.80, left ? 'blue' : 'red');
    add(x1, 138.80, left ? 'blue' : 'red');
    add(x0, 1.61,   left ? 'blue' : 'red');
    add(x1, 1.61,   left ? 'blue' : 'red');
  }

  // --- Four three-block clusters around the centre goal --- [estimated] ----
  const cluster = (cx, cy, color, flipX, flipY) => {
    const s = FIELD.BLOCK.size, sx = flipX ? -1 : 1, sy = flipY ? -1 : 1;
    add(cx,               cy,               color);
    add(cx + s * sx,      cy,               color);
    add(cx + s * 0.5 * sx, cy + s * 0.87 * sy, color);
  };
  cluster(47.9, 89.0, 'red',  false, false);   // upper-left
  cluster(mirrorX(47.9), 89.0, 'blue', true,  false);   // upper-right
  cluster(47.9, mirrorY(89.0), 'red',  false, true );   // lower-left
  cluster(mirrorX(47.9), mirrorY(89.0), 'blue', true,  true );   // lower-right

  // --- One block visible in each loader ------------------- [estimated] ----
  for (const lx of FIELD.LOADER.x) {
    for (const ly of FIELD.LOADER.y) {
      add(lx, ly, (lx < C) === (ly > C) ? 'blue' : 'red');
    }
  }

  return B;
})();

// ---------------------------------------------------------------------------
//  Palette. Two themes; the field itself barely changes because a VEX field
//  is grey in any light, but the surround and the line work do.
// ---------------------------------------------------------------------------
const THEMES = {
  light: {
    surround: '#eef1f5', wall: '#c3c8d0', wallTop: '#dfe3e9',
    tileA: '#9aa0a7', tileB: '#8f959d', grain: 'rgba(255,255,255,0.055)',
    seam: 'rgba(40,45,52,0.30)',
    tape: 'rgba(252,253,255,0.72)',
    goalTop: '#e6e9ee', goalSide: '#b8bec7', goalEdge: 'rgba(40,45,52,0.35)',
    strut: '#e08a2e', strutDark: '#a8631d',
    red: '#d5253a', redDark: '#96182a', blue: '#1f8fe0', blueDark: '#14649e',
    shadow: 'rgba(20,24,30,1)',
  },
  dark: {
    surround: '#0e1116', wall: '#3a3f47', wallTop: '#4a5058',
    tileA: '#7d838b', tileB: '#737981', grain: 'rgba(255,255,255,0.05)',
    seam: 'rgba(20,24,30,0.45)',
    tape: 'rgba(245,248,252,0.70)',
    goalTop: '#d2d7de', goalSide: '#9299a3', goalEdge: 'rgba(15,18,23,0.5)',
    strut: '#d9822b', strutDark: '#9c5a17',
    red: '#e0243c', redDark: '#951828', blue: '#2196f3', blueDark: '#13649f',
    shadow: 'rgba(0,0,0,1)',
  },
};

let P = THEMES.light;                       // active palette
function setTheme(name) { P = THEMES[name] || THEMES.light; }

// ---------------------------------------------------------------------------
//  Soft shadow helper.
//
//  Canvas's built-in shadowBlur behaves inconsistently under a flipped, scaled
//  transform, so shadows are drawn explicitly: the same shape, stamped a few
//  times at decreasing offset and alpha. Predictable everywhere, and the
//  offset can be tied to the object's real height.
//
//  In field coordinates +Y is up, so a shadow falling down-right on screen is
//  an offset of (+dx, -dy).
// ---------------------------------------------------------------------------
function withShadow(ctx, heightIn, shape) {
  const d = Math.min(heightIn * 0.055, 1.3);
  ctx.save();
  for (const [k, a] of [[1.0, 0.10], [0.62, 0.10], [0.28, 0.10]]) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = P.shadow;
    ctx.translate(d * k, -d * k);
    shape(ctx);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// A rounded rectangle path in field coordinates.
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
//  Floor
//
//  A real field is 36 foam tiles. Adjacent tiles are laid with their grain
//  rotated 90 degrees, which is what produces the checkerboard you see in the
//  official render -- it is not a colour difference, it is the direction the
//  light catches the moulded texture. Drawing it that way is both more honest
//  and better looking than two flat greys.
// ---------------------------------------------------------------------------
function drawFloor(ctx, s) {
  const T = FIELD.TILE, N = 6;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const vertical = (i + j) % 2 === 0;
      ctx.fillStyle = vertical ? P.tileA : P.tileB;
      ctx.fillRect(i * T, j * T, T, T);

      // grain: fine parallel lines, direction alternating per tile
      if (s > 2.2) {
        ctx.save();
        ctx.beginPath(); ctx.rect(i * T, j * T, T, T); ctx.clip();
        ctx.strokeStyle = P.grain;
        ctx.lineWidth = 0.42;
        ctx.beginPath();
        for (let k = 0.6; k < T; k += 1.35) {
          if (vertical) { ctx.moveTo(i * T + k, j * T); ctx.lineTo(i * T + k, j * T + T); }
          else          { ctx.moveTo(i * T, j * T + k); ctx.lineTo(i * T + T, j * T + k); }
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // tile seams
  ctx.strokeStyle = P.seam;
  ctx.lineWidth = Math.max(0.12, 1.4 / s);
  ctx.beginPath();
  for (let i = 1; i < N; i++) {
    ctx.moveTo(i * T, 0); ctx.lineTo(i * T, FIELD.SIZE);
    ctx.moveTo(0, i * T); ctx.lineTo(FIELD.SIZE, i * T);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
//  Field tape: only the double centre line. No diamond, no corner marks --
//  those exist on the real field purely as assembly alignment guides and add
//  nothing but clutter here.
// ---------------------------------------------------------------------------
function drawTape(ctx) {
  const C = FIELD.CENTER;
  ctx.save();
  ctx.fillStyle = P.tape;
  ctx.fillRect(C - 1.35, 0, 0.85, FIELD.SIZE);
  ctx.fillRect(C + 0.50, 0, 0.85, FIELD.SIZE);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Park zone: a 2 in wide bracket standing 1 in off the floor, open toward
//  the wall. Drawn with a side face so the thickness reads.
// ---------------------------------------------------------------------------
function drawParkZone(ctx, side) {
  const pk = FIELD.PARK;
  const isLeft = side === 'left';
  const x0 = isLeft ? 0 : FIELD.SIZE - pk.depth;
  const y0 = FIELD.CENTER - pk.height / 2;
  const col = isLeft ? P.red : P.blue;
  const dark = isLeft ? P.redDark : P.blueDark;
  const b = pk.bar, r = 2.4;

  // The bracket as three bars. Rounded only on the field-facing corners.
  const bars = [
    [x0, y0 + pk.height - b, pk.depth, b],                       // top
    [x0, y0,                 pk.depth, b],                       // bottom
    isLeft ? [x0 + pk.depth - b, y0, b, pk.height]               // field-side
           : [x0,               y0, b, pk.height],
  ];

  withShadow(ctx, pk.thick * 3, (c) => {
    c.beginPath();
    for (const [x, y, w, h] of bars) c.rect(x, y, w, h);
  });

  // side face (the 1 in of thickness), drawn first and offset downward
  ctx.fillStyle = dark;
  for (const [x, y, w, h] of bars) ctx.fillRect(x, y - 0.55, w, h);

  // top face
  ctx.fillStyle = col;
  for (const [x, y, w, h] of bars) ctx.fillRect(x, y, w, h);

  // rounded outer corner on the field side, matching the drawing
  ctx.fillStyle = col;
  const cx = isLeft ? x0 + pk.depth - b : x0;
  roundRect(ctx, cx, y0, b, pk.height, r);
  ctx.fill();

  // top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (const [x, y, w, h] of bars) ctx.fillRect(x, y + h - 0.42, w, 0.42);
}

// ---------------------------------------------------------------------------
//  Block: an octagon 3.23 in across the flats, with a bevelled top face.
// ---------------------------------------------------------------------------
function blockPath(ctx, x, y, size) {
  const h = size / 2, k = h * 0.414;      // octagon corner cut
  ctx.beginPath();
  ctx.moveTo(x - h + k, y - h);
  ctx.lineTo(x + h - k, y - h);
  ctx.lineTo(x + h,     y - h + k);
  ctx.lineTo(x + h,     y + h - k);
  ctx.lineTo(x + h - k, y + h);
  ctx.lineTo(x - h + k, y + h);
  ctx.lineTo(x - h,     y + h - k);
  ctx.lineTo(x - h,     y - h + k);
  ctx.closePath();
}

function drawBlock(ctx, b, alpha) {
  const S = FIELD.BLOCK.size;
  const col  = b.color === 'red' ? P.red     : P.blue;
  const dark = b.color === 'red' ? P.redDark : P.blueDark;

  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;

  withShadow(ctx, FIELD.BLOCK.height, (c) => blockPath(c, b.x, b.y, S));

  // outer body
  ctx.fillStyle = dark;
  blockPath(ctx, b.x, b.y, S);
  ctx.fill();

  // inset top face, which is what gives the moulded look
  ctx.fillStyle = col;
  blockPath(ctx, b.x, b.y, S * 0.86);
  ctx.fill();

  // highlight toward the light (up-left on screen = -x, +y in field coords)
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  blockPath(ctx, b.x - S * 0.055, b.y + S * 0.055, S * 0.48);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Long goal: two orange legs, a translucent trough between them, and the
//  four blocks that start inside it showing through.
// ---------------------------------------------------------------------------
function drawLongGoal(ctx, gy, blocks) {
  const g = FIELD.LONG_GOAL, C = FIELD.CENTER;
  const x0 = C - g.length / 2, w = g.length, h = g.width, y0 = gy - h / 2;

  withShadow(ctx, g.height, (c) => c.rect(x0, y0, w, h));

  // trough body
  const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
  grad.addColorStop(0,    P.goalSide);
  grad.addColorStop(0.45, P.goalTop);
  grad.addColorStop(1,    P.goalSide);
  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, w, h);

  // the blocks sitting in the trough, seen dimly through the plastic
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  for (const b of blocks) drawBlock(ctx, b, 0.5);
  ctx.restore();

  // translucent lid over them
  ctx.fillStyle = 'rgba(240,244,249,0.42)';
  ctx.fillRect(x0, y0, w, h);

  // orange support legs at each end
  ctx.fillStyle = P.strutDark;
  ctx.fillRect(x0, y0 - 0.5, g.legWidth, h);
  ctx.fillRect(x0 + w - g.legWidth, y0 - 0.5, g.legWidth, h);
  ctx.fillStyle = P.strut;
  ctx.fillRect(x0, y0, g.legWidth, h);
  ctx.fillRect(x0 + w - g.legWidth, y0, g.legWidth, h);

  // central orange band, as on the real goal
  ctx.fillStyle = P.strut;
  ctx.fillRect(C - 3.0, y0, 6.0, h);

  ctx.strokeStyle = P.goalEdge;
  ctx.lineWidth = 0.16;
  ctx.strokeRect(x0, y0, w, h);
}

// ---------------------------------------------------------------------------
//  Centre goal: two crossed translucent arms. No ground projection -- the
//  white outline on the real field is an assembly alignment guide.
// ---------------------------------------------------------------------------
function drawCenterGoal(ctx) {
  const cg = FIELD.CENTER_GOAL, C = FIELD.CENTER;

  ctx.save();
  ctx.translate(C, C);

  withShadow(ctx, cg.height, (c) => {
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      c.save(); c.rotate(a);
      c.rect(-cg.arm, -cg.width / 2, cg.arm * 2, cg.width);
      c.restore();
    }
  });

  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    ctx.save();
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, -cg.width / 2, 0, cg.width / 2);
    g.addColorStop(0,   P.goalSide);
    g.addColorStop(0.4, P.goalTop);
    g.addColorStop(1,   P.goalSide);
    ctx.fillStyle = g;
    ctx.fillRect(-cg.arm, -cg.width / 2, cg.arm * 2, cg.width);
    ctx.strokeStyle = P.goalEdge;
    ctx.lineWidth = 0.16;
    ctx.strokeRect(-cg.arm, -cg.width / 2, cg.arm * 2, cg.width);
    ctx.restore();
  }

  // orange hub
  ctx.fillStyle = P.strutDark;
  ctx.beginPath(); ctx.arc(0, -0.35, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = P.strut;
  ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(-0.5, 0.5, 1.2, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Loader: a tall tube. Drawn as a ring with the block inside showing.
// ---------------------------------------------------------------------------
function drawLoader(ctx, lx, ly, block) {
  const r = FIELD.LOADER.diameter / 2;

  withShadow(ctx, FIELD.LOADER.height, (c) => {
    c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2);
  });

  // the block resting inside, dimmed
  if (block) {
    ctx.save();
    ctx.beginPath(); ctx.arc(lx, ly, r * 0.82, 0, Math.PI * 2); ctx.clip();
    drawBlock(ctx, block, 0.62);
    ctx.restore();
  }

  // orange collar
  ctx.strokeStyle = P.strutDark;
  ctx.lineWidth = r * 0.42;
  ctx.beginPath(); ctx.arc(lx, ly, r * 0.83, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = P.strut;
  ctx.lineWidth = r * 0.34;
  ctx.beginPath(); ctx.arc(lx, ly, r * 0.83, 0, Math.PI * 2); ctx.stroke();

  // rim highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = r * 0.10;
  ctx.beginPath(); ctx.arc(lx, ly, r * 0.95, Math.PI * 0.55, Math.PI * 1.25);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
//  Perimeter wall, drawn with a visible top face so the field reads as a
//  contained box rather than a flat square.
// ---------------------------------------------------------------------------
function drawWall(ctx) {
  const W = FIELD.WALL_THICKNESS, S = FIELD.SIZE;
  ctx.fillStyle = P.wall;
  ctx.fillRect(-W, -W, S + 2 * W, S + 2 * W);
  ctx.fillStyle = P.wallTop;
  ctx.fillRect(-W, -W, S + 2 * W, W * 0.55);          // near rail catches light
  ctx.fillStyle = 'rgba(20,24,30,0.10)';
  ctx.fillRect(-W, S + W * 0.45, S + 2 * W, W * 0.55);
  // inner shadow cast by the wall onto the floor
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = P.shadow;
  ctx.fillRect(0, S - 1.6, S, 1.6);
  ctx.fillRect(0, 0, 1.6, S);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  drawField -- called with a transform already mapping inches to pixels and
//  flipping y. `s` is pixels per inch, used only for zoom-dependent detail.
//  `hidden` is a Set of block ids to omit (blocks the robot has collected).
// ---------------------------------------------------------------------------
function drawField(ctx, s, hidden) {
  hidden = hidden || new Set();
  const live = BLOCKS.filter(b => !hidden.has(b.id));

  drawWall(ctx);
  drawFloor(ctx, s);
  drawTape(ctx);

  drawParkZone(ctx, 'left');
  drawParkZone(ctx, 'right');

  // blocks that lie on the open floor
  const inGoal = new Set();
  for (const gy of FIELD.LONG_GOAL.y)
    for (const b of live) if (Math.abs(b.y - gy) < 3) inGoal.add(b.id);
  for (const lx of FIELD.LOADER.x)
    for (const ly of FIELD.LOADER.y)
      for (const b of live) if (Math.hypot(b.x - lx, b.y - ly) < 2.5) inGoal.add(b.id);

  for (const b of live) if (!inGoal.has(b.id)) drawBlock(ctx, b);

  for (const gy of FIELD.LONG_GOAL.y)
    drawLongGoal(ctx, gy, live.filter(b => Math.abs(b.y - gy) < 3));

  drawCenterGoal(ctx);

  for (const lx of FIELD.LOADER.x)
    for (const ly of FIELD.LOADER.y)
      drawLoader(ctx, lx, ly,
        live.find(b => Math.hypot(b.x - lx, b.y - ly) < 2.5));
}
