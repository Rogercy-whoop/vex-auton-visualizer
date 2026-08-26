// ============================================================================
//  viewer/viewer.js  --  camera, rulers, measuring tools
// ----------------------------------------------------------------------------
//  Phase 4a. Path and robot arrive in 4b.
// ============================================================================

const canvas = document.getElementById('field');
const ctx    = canvas.getContext('2d');

// ---------------------------------------------------------------------------
//  Camera: three numbers. `s` = screen pixels per field inch; (tx,ty) = where
//  field (0,0) lands on screen. Zoom, pan and fit are all arithmetic on these.
// ---------------------------------------------------------------------------
const view = { s: 4, tx: 0, ty: 0 };
const toScreen = (x, y) => ({ x: view.tx + x * view.s, y: view.ty - y * view.s });
const toField  = (px, py) => ({ x: (px - view.tx) / view.s, y: (view.ty - py) / view.s });

const MARGIN = 26;                    // gutter reserved for the edge rulers

// ---------------------------------------------------------------------------
//  Persistent measuring state
// ---------------------------------------------------------------------------
const measures = [];                  // [{from:{x,y}, to:{x,y}}] -- kept until deleted
let   pending  = null;                // the one being dragged right now

// The straight-edge. Defined by a baseline in FIELD coordinates, so its edge
// sits at an exact, readable position; only its visual thickness is in screen
// pixels. That is the whole point of it: something a robot can be aligned to.
const ruler = { on: false, x: 35, y: 70.2, angle: 0, length: 46.8 };
const RULER_PX = 34;                  // body thickness, screen pixels

let theme = 'light';

// ---------------------------------------------------------------------------
//  Canvas sizing (hi-DPI aware) and fit
// ---------------------------------------------------------------------------
function fitView() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const span = FIELD.SIZE + FIELD.WALL_THICKNESS * 2 + 6;
  view.s  = Math.min(W - MARGIN * 2, H - MARGIN * 2) / span;
  view.tx = (W - FIELD.SIZE * view.s) / 2;
  view.ty = (H + FIELD.SIZE * view.s) / 2;
  draw();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width  = Math.round(r.width  * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitView();
}

// ---------------------------------------------------------------------------
//  Pointer handling
// ---------------------------------------------------------------------------
let mouse   = { x: 0, y: 0, inside: false };
let panning = null;
let drag    = null;      // {kind:'ruler-body'|'ruler-tip', ...}

const evPos = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

function rulerPoints() {
  const a = ruler.angle * Math.PI / 180;
  // angle measured in the ROBOT convention: 0 = +Y, clockwise positive
  const dx = Math.sin(a), dy = Math.cos(a);
  return {
    a: { x: ruler.x, y: ruler.y },
    b: { x: ruler.x + dx * ruler.length, y: ruler.y + dy * ruler.length },
    dx, dy,
  };
}

function hitRuler(p) {
  if (!ruler.on) return null;
  const { a, b } = rulerPoints();
  const A = toScreen(a.x, a.y), B = toScreen(b.x, b.y);
  if (Math.hypot(p.x - B.x, p.y - B.y) < 11) return 'ruler-tip';
  if (Math.hypot(p.x - A.x, p.y - A.y) < 11) return 'ruler-tip-a';
  // distance from the body strip
  const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1;
  let t = ((p.x - A.x) * vx + (p.y - A.y) * vy) / L2;
  if (t < 0 || t > 1) return null;
  const px = A.x + t * vx, py = A.y + t * vy;
  const d = Math.hypot(p.x - px, p.y - py);
  // the body extends to one side only
  const side = (p.x - A.x) * vy - (p.y - A.y) * vx;
  if (d < RULER_PX && side > 0) return 'ruler-body';
  return null;
}

canvas.addEventListener('mousedown', (e) => {
  const p = evPos(e);
  if (e.button === 2) return;

  if (e.shiftKey) {
    const f = toField(p.x, p.y);
    pending = { from: f, to: f };
    return;
  }
  const hit = hitRuler(p);
  if (hit) {
    drag = { kind: hit, grab: toField(p.x, p.y), x0: ruler.x, y0: ruler.y };
    return;
  }
  panning = p;
});

canvas.addEventListener('mousemove', (e) => {
  const p = evPos(e);
  mouse = { x: p.x, y: p.y, inside: true };

  if (panning) {
    view.tx += p.x - panning.x;
    view.ty += p.y - panning.y;
    panning = p;
  } else if (pending) {
    pending.to = toField(p.x, p.y);
  } else if (drag) {
    const f = toField(p.x, p.y);
    if (drag.kind === 'ruler-body') {
      ruler.x = drag.x0 + (f.x - drag.grab.x);
      ruler.y = drag.y0 + (f.y - drag.grab.y);
    } else {
      // dragging an end sets both angle and length
      const anchor = drag.kind === 'ruler-tip' ? { x: ruler.x, y: ruler.y }
                                               : rulerPoints().b;
      const dx = f.x - anchor.x, dy = f.y - anchor.y;
      let ang = Math.atan2(dx, dy) * 180 / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;   // snap to 15 degrees
      ruler.angle  = (ang + 360) % 360;
      ruler.length = Math.max(6, Math.hypot(dx, dy));
      if (drag.kind === 'ruler-tip-a') { ruler.x = anchor.x; ruler.y = anchor.y; }
    }
  }
  draw();
});

window.addEventListener('mouseup', () => {
  if (pending) {
    const d = Math.hypot(pending.to.x - pending.from.x, pending.to.y - pending.from.y);
    if (d > 0.5) measures.push(pending);      // keep it; only tiny drags are discarded
    pending = null;
    refreshMeasureList();
  }
  panning = null;
  drag = null;
  draw();
});

canvas.addEventListener('mouseleave', () => { mouse.inside = false; draw(); });
canvas.addEventListener('contextmenu', (e) => {
  // right-click deletes the measurement under the cursor
  e.preventDefault();
  const p = evPos(e);
  for (let i = measures.length - 1; i >= 0; i--) {
    const A = toScreen(measures[i].from.x, measures[i].from.y);
    const B = toScreen(measures[i].to.x,   measures[i].to.y);
    const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - A.x) * vx + (p.y - A.y) * vy) / L2));
    if (Math.hypot(p.x - (A.x + t * vx), p.y - (A.y + t * vy)) < 8) {
      measures.splice(i, 1); refreshMeasureList(); draw(); return;
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = evPos(e);
  const before = toField(p.x, p.y);
  view.s = Math.max(1, Math.min(70, view.s * Math.exp(-e.deltaY * 0.0015)));
  view.tx = p.x - before.x * view.s;
  view.ty = p.y + before.y * view.s;
  draw();
}, { passive: false });

// ---------------------------------------------------------------------------
//  Edge rulers. Tick spacing steps through a fixed ladder of useful intervals
//  rather than an arbitrary computed one -- "every 7.3 in" helps nobody.
// ---------------------------------------------------------------------------
const TICK_LADDER = [FIELD.TILE, FIELD.TILE / 2, 6, 3, 1];

function drawEdgeRulers() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  let step = FIELD.TILE;
  for (const t of TICK_LADDER) if (t * view.s >= 55) step = t;

  const css = getComputedStyle(document.documentElement);
  ctx.save();
  ctx.fillStyle = css.getPropertyValue('--gutter').trim();
  ctx.fillRect(0, 0, W, MARGIN);
  ctx.fillRect(0, 0, MARGIN, H);

  ctx.font = '10px ui-monospace, Consolas, monospace';
  ctx.fillStyle = css.getPropertyValue('--muted').trim();
  ctx.strokeStyle = css.getPropertyValue('--hair').trim();
  ctx.lineWidth = 1;

  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let x = 0; x <= FIELD.SIZE + 0.01; x += step) {
    const sx = toScreen(x, 0).x;
    if (sx < MARGIN - 2 || sx > W) continue;
    ctx.beginPath(); ctx.moveTo(sx, MARGIN - 5); ctx.lineTo(sx, MARGIN); ctx.stroke();
    ctx.fillText(x.toFixed(0), sx, MARGIN - 6);
  }

  ctx.textBaseline = 'top';
  for (let y = 0; y <= FIELD.SIZE + 0.01; y += step) {
    const sy = toScreen(0, y).y;
    if (sy < MARGIN || sy > H) continue;
    ctx.beginPath(); ctx.moveTo(MARGIN - 5, sy); ctx.lineTo(MARGIN, sy); ctx.stroke();
    ctx.save(); ctx.translate(MARGIN - 7, sy); ctx.rotate(-Math.PI / 2);
    ctx.fillText(y.toFixed(0), 0, 0); ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.fillText('in', 5, 5);
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  The straight-edge. Semi-transparent body with an inch scale along the
//  working edge, so a robot can be pushed up against it the way you would use
//  a ruler on paper.
// ---------------------------------------------------------------------------
function drawRuler() {
  if (!ruler.on) return;
  const { a, b } = rulerPoints();
  const A = toScreen(a.x, a.y), B = toScreen(b.x, b.y);
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  const ang = Math.atan2(B.y - A.y, B.x - A.x);

  ctx.save();
  ctx.translate(A.x, A.y);
  ctx.rotate(ang);

  // body -- extends to one side; the baseline at y=0 is the working edge
  ctx.fillStyle = 'rgba(60,110,170,0.16)';
  ctx.fillRect(0, 0, len, RULER_PX);
  ctx.strokeStyle = 'rgba(40,90,150,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();   // the edge
  ctx.strokeStyle = 'rgba(40,90,150,0.30)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, len, RULER_PX);

  // inch scale along the edge
  ctx.strokeStyle = 'rgba(30,70,120,0.55)';
  ctx.fillStyle   = 'rgba(30,70,120,0.85)';
  ctx.font = '9px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const stepIn = view.s > 9 ? 1 : (view.s > 4 ? 3 : 6);
  for (let i = 0; i <= ruler.length + 0.001; i += stepIn) {
    const px = i * view.s;
    if (px > len + 0.5) break;
    const major = Math.abs(i % (stepIn * (stepIn === 1 ? 6 : 2))) < 1e-6;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, major ? 11 : 6); ctx.stroke();
    if (major && len > 40) ctx.fillText(i.toFixed(0), px, 12);
  }

  // end handles
  ctx.restore();
  for (const [pt, label] of [[A, 'a'], [B, 'b']]) {
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#2f6fb0'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  document.getElementById('ruler-readout').textContent =
    `${ruler.length.toFixed(1)}"  @ ${ruler.angle.toFixed(1)}°  ` +
    `from (${ruler.x.toFixed(1)}, ${ruler.y.toFixed(1)})`;
}

// ---------------------------------------------------------------------------
//  Measurement lines. Length is reported in inches AND tiles, because the
//  routines' own comments are written in tiles ("距离左边垫子3格").
//  Bearing uses the robot's convention so the number can be typed straight
//  into turn_to_angle().
// ---------------------------------------------------------------------------
function drawOneMeasure(m, active) {
  const A = toScreen(m.from.x, m.from.y), B = toScreen(m.to.x, m.to.y);
  const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
  const len = Math.hypot(dx, dy);
  const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

  ctx.save();
  ctx.strokeStyle = active ? '#e8871a' : '#c8721a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  for (const p of [A, B]) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e8871a'; ctx.fill();
  }

  const txt = `${len.toFixed(2)}"  ${(len / FIELD.TILE).toFixed(2)} tiles  @ ${bearing.toFixed(1)}°`;
  ctx.font = '11px ui-monospace, Consolas, monospace';
  const w = ctx.measureText(txt).width + 12;
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  ctx.fillRect(mx - w / 2, my - 26, w, 18);
  ctx.strokeRect(mx - w / 2, my - 26, w, 18);
  ctx.fillStyle = '#8a4a08';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, mx, my - 17);
  ctx.restore();
}

function refreshMeasureList() {
  document.getElementById('measure-count').textContent =
    measures.length === 0 ? 'none' : `${measures.length}`;
}

// ---------------------------------------------------------------------------
//  Crosshair readout
// ---------------------------------------------------------------------------
function drawCrosshair() {
  if (!mouse.inside || mouse.x < MARGIN || mouse.y < MARGIN) return;
  const f = toField(mouse.x, mouse.y);
  document.getElementById('cursor-in').textContent =
    `${f.x.toFixed(1)}, ${f.y.toFixed(1)}`;
  document.getElementById('cursor-tile').textContent =
    `${(f.x / FIELD.TILE).toFixed(2)}, ${(f.y / FIELD.TILE).toFixed(2)}`;

  ctx.save();
  ctx.strokeStyle = 'rgba(40,110,190,0.30)';
  ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, mouse.y); ctx.lineTo(canvas.clientWidth, mouse.y);
  ctx.moveTo(mouse.x, MARGIN); ctx.lineTo(mouse.x, canvas.clientHeight);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
//  Frame
// ---------------------------------------------------------------------------
function draw() {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const css = getComputedStyle(document.documentElement);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css.getPropertyValue('--stage').trim();
  ctx.fillRect(0, 0, W, H);

  // field, drawn in inches with y flipped
  ctx.save();
  ctx.setTransform(dpr * view.s, 0, 0, -dpr * view.s, dpr * view.tx, dpr * view.ty);
  drawField(ctx, view.s, null);
  ctx.restore();

  // overlays in screen pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawEdgeRulers();
  drawRuler();
  for (const m of measures) drawOneMeasure(m, false);
  if (pending) drawOneMeasure(pending, true);
  drawCrosshair();

  document.getElementById('zoom').textContent = view.s.toFixed(2) + ' px/in';
}

// ---------------------------------------------------------------------------
//  Controls
// ---------------------------------------------------------------------------
document.getElementById('btn-fit').onclick = fitView;
document.getElementById('btn-ruler').onclick = (e) => {
  ruler.on = !ruler.on;
  e.target.classList.toggle('active', ruler.on);
  if (ruler.on) { ruler.x = 35; ruler.y = 70.2; ruler.angle = 0; ruler.length = 46.8; }
  document.getElementById('ruler-readout').textContent = ruler.on ? '' : 'off';
  draw();
};
document.getElementById('btn-clear').onclick = () => {
  measures.length = 0; refreshMeasureList(); draw();
};
document.getElementById('btn-theme').onclick = (e) => {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  setTheme(theme);
  e.target.textContent = theme === 'light' ? 'Dark' : 'Light';
  draw();
};

window.addEventListener('resize', resize);
setTheme('light');
refreshMeasureList();
resize();
