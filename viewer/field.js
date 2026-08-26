// ============================================================================
//  viewer/field.js  --  VEX V5RC 2025-26 "Push Back" field geometry + drawing
// ----------------------------------------------------------------------------
//  Every number below is in INCHES, taken from the official field drawings
//  (276-9142 FIELD SPECIFICATIONS, released 2025-05-03).
//
//  COORDINATE SYSTEM -- this is the one thing that must not be got wrong:
//
//      origin (0,0) = bottom-left corner of the playing floor
//      +X = right, +Y = up          (normal maths axes)
//      heading 0 deg = +Y (straight "up" the field), CLOCKWISE positive
//
//  That heading convention is a COMPASS convention, not the maths one, and it
//  is copied from the robot's own code: the template's drive_to_point uses
//  atan2(dX, dY) with the arguments swapped, which is only correct when 0 deg
//  points along +Y. So the integration rule is:
//
//      x += distance * sin(theta)
//      y += distance * cos(theta)
//
//  Canvas's y axis points DOWN, so the renderer flips it once at the transform
//  and everything below can be written in ordinary field coordinates.
// ============================================================================

const FIELD = {
  // The playing floor, measured wall face to wall face. The outer frame is
  // 12 ft (144 in); the ~1.8 in difference is the wall thickness.
  SIZE: 140.4,
  CENTER: 70.2,

  // Six tiles per side. Tile seams are the main visual reference a driver
  // uses when placing a robot, so they are drawn, not just implied.
  TILE: 140.4 / 6,          // 23.4 in

  WALL_THICKNESS: 1.8,

  // ---- Long Goals (the two horizontal bridges) --------------------------
  // Overall length 1239.27 mm = 48.79 in; bar width 140.53 mm = 5.53 in.
  // Centre lines at y = 23.44 and y = 116.97 from the reference drawing;
  // they span x = 45.83 .. 94.62, which is symmetric about the centre.
  LONG_GOAL: { length: 48.79, width: 5.53, y: [23.44, 116.97] },

  // ---- Centre Goal (the X) ----------------------------------------------
  // Each arm reaches 573.99 mm = 22.60 in from the centre; arm width
  // 101.60 mm = 4.00 in. Two crossed bars at +/- 45 degrees.
  CENTER_GOAL: { arm: 22.60, width: 4.00 },

  // ---- Loaders (the four orange corner tubes) ---------------------------
  // Base diameter 106 mm = 4.17 in. Positions read off the tick marks on the
  // reference drawing: x = 2.58 / 137.87, y = 23.44 / 116.97.
  LOADER: { diameter: 4.17, x: [2.58, 137.87], y: [23.44, 116.97] },

  // ---- Park Zones (left = red alliance, right = blue) -------------------
  // 428.18 mm = 16.86 in deep from the wall, 479.35 mm = 18.87 in tall,
  // centred vertically.
  PARK: { depth: 16.86, height: 18.87 },

  // ---- Scoring blocks ----------------------------------------------------
  // 82 mm = 3.23 in across the flats, 97.632 mm = 3.84 in across corners.
  BLOCK: { size: 3.23, diagonal: 3.84 },
};

// Field tape. The spec sheet describes a double line down the centre plus a
// diamond around the middle four tiles, with the corners splitting at 45 deg.
const TAPE = {
  width: 2.0,           // the double line reads as roughly 2 in overall
  diamondRadius: FIELD.TILE * 2,   // vertices two tiles out from centre
};

// ---------------------------------------------------------------------------
//  Colours. Kept in one place so the whole drawing can be re-themed at once.
// ---------------------------------------------------------------------------
const C = {
  floorA:  '#8c8f93',    // the two tile shades, alternating like a chessboard
  floorB:  '#7e8186',
  seam:    '#6b6e73',
  wall:    '#3a3d42',
  tape:    '#f2f4f7',
  goal:    '#d9dde3',
  goalEdge:'#9aa0a8',
  strut:   '#e08a2e',    // the orange structural pieces
  red:     '#e0243c',
  blue:    '#2196f3',
  outline: '#2b2e33',
};

// ---------------------------------------------------------------------------
//  drawField(ctx, opts)
//
//  Draws in FIELD INCHES. The caller is expected to have already applied a
//  transform that maps field inches to screen pixels and flips the y axis,
//  so nothing in here has to think about zoom, pan, or which way is up.
//
//  `s` is the current scale (pixels per inch) and is used only to keep line
//  widths one screen pixel thick no matter how far the user has zoomed.
// ---------------------------------------------------------------------------
function drawField(ctx, s, opts) {
  opts = opts || {};
  const F = FIELD, N = 6, T = F.TILE;
  const px = (n) => n / s;          // n screen pixels expressed in inches

  // ---- perimeter wall --------------------------------------------------
  ctx.fillStyle = C.wall;
  ctx.fillRect(-F.WALL_THICKNESS, -F.WALL_THICKNESS,
               F.SIZE + 2 * F.WALL_THICKNESS, F.SIZE + 2 * F.WALL_THICKNESS);

  // ---- floor tiles -----------------------------------------------------
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      ctx.fillStyle = ((i + j) % 2 === 0) ? C.floorA : C.floorB;
      ctx.fillRect(i * T, j * T, T, T);
    }
  }

  // ---- tile seams ------------------------------------------------------
  // These are the lines a driver actually lines a robot up against, so they
  // are drawn slightly stronger than a hairline.
  ctx.strokeStyle = C.seam;
  ctx.lineWidth = px(1.5);
  ctx.beginPath();
  for (let i = 1; i < N; i++) {
    ctx.moveTo(i * T, 0);      ctx.lineTo(i * T, F.SIZE);
    ctx.moveTo(0, i * T);      ctx.lineTo(F.SIZE, i * T);
  }
  ctx.stroke();

  // ---- field tape ------------------------------------------------------
  ctx.strokeStyle = C.tape;
  ctx.lineWidth = TAPE.width;
  ctx.lineCap = 'butt';

  // centre double line, drawn as two lines a tile-tooth apart
  ctx.beginPath();
  ctx.moveTo(F.CENTER - 1.2, 0);  ctx.lineTo(F.CENTER - 1.2, F.SIZE);
  ctx.moveTo(F.CENTER + 1.2, 0);  ctx.lineTo(F.CENTER + 1.2, F.SIZE);
  ctx.stroke();

  // diamond around the middle
  const r = TAPE.diamondRadius, c = F.CENTER;
  ctx.beginPath();
  ctx.moveTo(c, c + r);
  ctx.lineTo(c + r, c);
  ctx.lineTo(c, c - r);
  ctx.lineTo(c - r, c);
  ctx.closePath();
  ctx.stroke();

  // ---- park zones ------------------------------------------------------
  // Drawn as an outline, not a fill, because a robot parks ON them and a
  // solid block would hide the robot.
  const pk = F.PARK, py0 = F.CENTER - pk.height / 2;
  ctx.lineWidth = px(3);
  ctx.strokeStyle = C.red;
  ctx.strokeRect(0, py0, pk.depth, pk.height);
  ctx.strokeStyle = C.blue;
  ctx.strokeRect(F.SIZE - pk.depth, py0, pk.depth, pk.height);

  // ---- long goals ------------------------------------------------------
  const lg = F.LONG_GOAL;
  for (const gy of lg.y) {
    // orange support legs at each end
    ctx.fillStyle = C.strut;
    ctx.fillRect(F.CENTER - lg.length / 2, gy - lg.width / 2, 5.9, lg.width);
    ctx.fillRect(F.CENTER + lg.length / 2 - 5.9, gy - lg.width / 2, 5.9, lg.width);
    // the goal trough itself
    ctx.fillStyle = C.goal;
    ctx.fillRect(F.CENTER - lg.length / 2 + 5.9, gy - lg.width / 2,
                 lg.length - 11.8, lg.width);
    ctx.strokeStyle = C.goalEdge;
    ctx.lineWidth = px(1);
    ctx.strokeRect(F.CENTER - lg.length / 2, gy - lg.width / 2, lg.length, lg.width);
  }

  // ---- centre goal (the X) ---------------------------------------------
  const cg = F.CENTER_GOAL;
  ctx.save();
  ctx.translate(c, c);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = C.goal;
    ctx.fillRect(-cg.arm, -cg.width / 2, cg.arm * 2, cg.width);
    ctx.strokeStyle = C.goalEdge;
    ctx.lineWidth = px(1);
    ctx.strokeRect(-cg.arm, -cg.width / 2, cg.arm * 2, cg.width);
    ctx.restore();
  }
  // orange centre hub
  ctx.fillStyle = C.strut;
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- loaders ---------------------------------------------------------
  const ld = F.LOADER;
  for (const lx of ld.x) {
    for (const ly of ld.y) {
      ctx.fillStyle = C.strut;
      ctx.beginPath();
      ctx.arc(lx, ly, ld.diameter / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = px(1);
      ctx.stroke();
    }
  }

  // ---- field boundary --------------------------------------------------
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = px(2);
  ctx.strokeRect(0, 0, F.SIZE, F.SIZE);
}
