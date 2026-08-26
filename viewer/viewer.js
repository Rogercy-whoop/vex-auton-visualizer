// ============================================================================
//  viewer/viewer.js  --  canvas, camera, and the measuring tools
// ----------------------------------------------------------------------------
//  Phase 4a: field rendering, zoom/pan, edge rulers, crosshair readout and a
//  shift-drag measuring line. Path and robot rendering arrive in 4b.
// ============================================================================

const canvas = document.getElementById('field');
const ctx    = canvas.getContext('2d');

// ---------------------------------------------------------------------------
//  The camera.
//
//  A "view" is just three numbers: how many screen pixels one field inch is
//  worth (s), and where field (0,0) lands on screen (tx, ty). Everything else
//  -- zooming, panning, fitting -- is arithmetic on those three.
// ---------------------------------------------------------------------------
const view = { s: 4, tx: 0, ty: 0 };

// field inches -> screen pixels, and back
const toScreen = (x, y) => ({ x: view.tx + x * view.s, y: view.ty - y * view.s });
const toField  = (px, py) => ({ x: (px - view.tx) / view.s, y: (view.ty - py) / view.s });

const MARGIN = 26;   // px of gutter reserved for the edge rulers

function fitView() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const span = FIELD.SIZE + FIELD.WALL_THICKNESS * 2;
  view.s  = Math.min(W - MARGIN * 2, H - MARGIN * 2) / span;
  // centre the field in the canvas
  view.tx = (W - FIELD.SIZE * view.s) / 2;
  view.ty = (H + FIELD.SIZE * view.s) / 2;
  draw();
}

// ---------------------------------------------------------------------------
//  Hi-DPI handling. Without this the canvas is blurry on a laptop screen: the
//  browser reports CSS pixels but the panel has more physical pixels than that.
// ---------------------------------------------------------------------------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width  = Math.round(r.width  * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  fitView();
}

// ---------------------------------------------------------------------------
//  Mouse state
// ---------------------------------------------------------------------------
let mouse   = { x: 0, y: 0, inside: false };
let panning = null;
let measure = null;    // {from:{x,y}, to:{x,y}} while shift-dragging

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
  mouse.inside = true;

  if (panning) {
    view.tx += mouse.x - panning.x;
    view.ty += mouse.y - panning.y;
    panning = { x: mouse.x, y: mouse.y };
  }
  if (measure) measure.to = toField(mouse.x, mouse.y);
  draw();
});

canvas.addEventListener('mouseleave', () => { mouse.inside = false; draw(); });

canvas.addEventListener('mousedown', (e) => {
  const r = canvas.getBoundingClientRect();
  const p = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (e.shiftKey) {
    const f = toField(p.x, p.y);
    measure = { from: f, to: f };
  } else {
    panning = p;
  }
});

window.addEventListener('mouseup', () => { panning = null; });
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') { measure = null; draw(); }
});

// Zoom about the cursor: the field point under the pointer must stay under the
// pointer after the scale changes, which is what the two lines after `k` do.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const before = toField(px, py);
  const k = Math.exp(-e.deltaY * 0.0015);
  view.s = Math.max(1, Math.min(60, view.s * k));
  view.tx = px - before.x * view.s;
  view.ty = py + before.y * view.s;
  draw();
}, { passive: false });

document.getElementById('btn-fit').onclick = fitView;

// ---------------------------------------------------------------------------
//  Rulers along the top and left edges.
//
//  The tick spacing adapts to zoom so the ruler stays readable whether the
//  whole field is in view or a single tile fills the screen. It is chosen from
//  a fixed ladder of "nice" intervals rather than computed, because arbitrary
//  intervals like 7.3 in are useless to a human placing a robot.
// ---------------------------------------------------------------------------
const TICK_LADDER = [FIELD.TILE, FIELD.TILE / 2, 6, 3, 1];

function pickTickSpacing() {
  // Want roughly 45+ screen pixels between labelled ticks.
  for (const t of TICK_LADDER) {
    if (t * view.s >= 45) continue;
    return t;
  }
  return TICK_LADDER[TICK_LADDER.length - 1];
}

function drawRulers() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  let step = FIELD.TILE;
  for (const t of TICK_LADDER) { if (t * view.s >= 55) step = t; }

  ctx.save();
  ctx.fillStyle = '#15181d';
  ctx.fillRect(0, 0, W, MARGIN);
  ctx.fillRect(0, 0, MARGIN, H);

  ctx.font = '10px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#8b929c';
  ctx.strokeStyle = '#3a4049';
  ctx.lineWidth = 1;

  // top ruler -- X in inches
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let x = 0; x <= FIELD.SIZE + 0.01; x += step) {
    const sx = toScreen(x, 0).x;
    if (sx < MARGIN - 2 || sx > W) continue;
    ctx.beginPath(); ctx.moveTo(sx, MARGIN - 5); ctx.lineTo(sx, MARGIN); ctx.stroke();
    ctx.fillText(x.toFixed(step < 1 ? 1 : 0), sx, MARGIN - 6);
  }

  // left ruler -- Y in inches, rotated so the digits read upright
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let y = 0; y <= FIELD.SIZE + 0.01; y += step) {
    const sy = toScreen(0, y).y;
    if (sy < MARGIN || sy > H) continue;
    ctx.beginPath(); ctx.moveTo(MARGIN - 5, sy); ctx.lineTo(MARGIN, sy); ctx.stroke();
    ctx.save();
    ctx.translate(MARGIN - 7, sy); ctx.rotate(-Math.PI / 2);
    ctx.fillText(y.toFixed(step < 1 ? 1 : 0), 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = '#5b636e';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('in', 4, 4);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Crosshair + readout: where is the cursor, in inches and in tiles.
//  "tile 3.5" is how a robot actually gets placed on a real field, so both
//  units are shown.
// ---------------------------------------------------------------------------
function drawCrosshair() {
  if (!mouse.inside || mouse.x < MARGIN || mouse.y < MARGIN) return;
  const f = toField(mouse.x, mouse.y);
  const W = canvas.clientWidth;

  ctx.save();
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, mouse.y); ctx.lineTo(W, mouse.y);
  ctx.moveTo(mouse.x, MARGIN); ctx.lineTo(mouse.x, canvas.clientHeight);
  ctx.stroke();
  ctx.restore();

  const txt = `x ${f.x.toFixed(1)}"  y ${f.y.toFixed(1)}"   ` +
              `tile ${(f.x / FIELD.TILE).toFixed(2)}, ${(f.y / FIELD.TILE).toFixed(2)}`;
  ctx.save();
  ctx.font = '12px ui-monospace, Consolas, monospace';
  const w = ctx.measureText(txt).width + 12;
  ctx.fillStyle = 'rgba(12,15,20,0.88)';
  ctx.fillRect(W - w - 8, canvas.clientHeight - 28, w, 20);
  ctx.fillStyle = '#cfe6ff';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, W - w - 2, canvas.clientHeight - 18);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Shift-drag measuring line. Reports length in inches AND in tiles, because
//  "1.5 tiles" is the unit the routines' own comments are written in
//  (autons.cpp: "距离左边垫子3格").
// ---------------------------------------------------------------------------
function drawMeasure() {
  if (!measure) return;
  const a = toScreen(measure.from.x, measure.from.y);
  const b = toScreen(measure.to.x,   measure.to.y);
  const dx = measure.to.x - measure.from.x, dy = measure.to.y - measure.from.y;
  const len = Math.hypot(dx, dy);
  // Bearing in the ROBOT's convention: 0 = +Y, clockwise positive.
  const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

  ctx.save();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  for (const p of [a, b]) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166'; ctx.fill();
  }

  const txt = `${len.toFixed(2)}"  =  ${(len / FIELD.TILE).toFixed(2)} tiles   @ ${bearing.toFixed(1)}°`;
  ctx.font = '12px ui-monospace, Consolas, monospace';
  const w = ctx.measureText(txt).width + 12;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  ctx.fillStyle = 'rgba(12,15,20,0.9)';
  ctx.fillRect(mx - w / 2, my - 26, w, 20);
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, mx, my - 16);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  One frame.
// ---------------------------------------------------------------------------
function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.save();
  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, W, H);

  // Apply the camera, INCLUDING the y flip, then draw in field inches.
  ctx.save();
  ctx.setTransform(
    (window.devicePixelRatio || 1) * view.s, 0,
    0, -(window.devicePixelRatio || 1) * view.s,
    (window.devicePixelRatio || 1) * view.tx,
    (window.devicePixelRatio || 1) * view.ty
  );
  drawField(ctx, view.s, {});
  ctx.restore();

  // Overlays are drawn in screen pixels, so they stay a constant size.
  drawRulers();
  drawMeasure();
  drawCrosshair();
  ctx.restore();

  document.getElementById('zoom').textContent = view.s.toFixed(2) + ' px/in';
}

window.addEventListener('resize', resize);
resize();
