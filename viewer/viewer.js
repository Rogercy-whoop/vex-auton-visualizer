// ============================================================================
//  viewer/viewer.js  --  camera, playback, start-pose placement, tools
// ----------------------------------------------------------------------------
//  Data flow:
//     out/logs.js  +  start pose  ->  simulate()  ->  ticks in FIELD coords
//
//  The start pose is an input to the simulation now, not a transform applied
//  afterwards: the robot collides with real obstacles, so where it starts
//  changes what it hits. Dragging therefore re-runs the simulation -- but only
//  a routine or model change replays the drawing animation, because watching
//  the line redraw on every mouse move would be noise, not feedback.
// ============================================================================

const canvas = document.getElementById('field');
const ctx    = canvas.getContext('2d');
const $      = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
//  Camera
// ---------------------------------------------------------------------------
const view = { s: 4, tx: 0, ty: 0 };
const toScreen = (x, y) => ({ x: view.tx + x * view.s, y: view.ty - y * view.s });
const toField  = (px, py) => ({ x: (px - view.tx) / view.s, y: (view.ty - py) / view.s });
const MARGIN = 26;

function fitView() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const span = FIELD.SIZE + FIELD.WALL_THICKNESS * 2 + 8;
  view.s  = Math.min(W - MARGIN * 2, H - MARGIN * 2) / span;
  view.tx = (W - FIELD.SIZE * view.s) / 2;
  view.ty = (H + FIELD.SIZE * view.s) / 2;
  draw();
}
function resize() {
  const dpr = window.devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  fitView();
}

// ---------------------------------------------------------------------------
//  Routine state
// ---------------------------------------------------------------------------
const LOGS = window.VEXSIM_LOGS || {};
let routine = Object.keys(LOGS)[0] || null;
let sim = null;
let start = { x: 24, y: 24, h: 0 };
let hooks = new Set();                 // action indices whose goal contact is intended
let timeMs = 0, playing = false, lastFrame = 0;
let showIntent = true, showSim = true, showEvents = true;
let reveal = 1, revealAnim = null;     // 0..1 progressive draw of the path

const DEFAULT_START = { x: 24, y: 24, h: 0 };
const KEY = { start: r => 'vexsim.start.' + r, presets: r => 'vexsim.presets.' + r, hooks: r => 'vexsim.hooks.' + r };

const readJSON = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// ---------------------------------------------------------------------------
//  Running the simulation
// ---------------------------------------------------------------------------
function runSim(animate) {
  if (!routine) return;
  const t0 = performance.now();
  sim = simulate(LOGS[routine], ROBOT, start, { hooks });
  const took = performance.now() - t0;

  timeMs = Math.min(timeMs, sim.duration_ms);
  $('timeline').max = sim.duration_ms;
  buildMovesTable();
  buildWarnings();

  if (animate) {
    setStatus(`simulating ${routine} …`, true);
    reveal = 0;
    revealAnim = { t0: performance.now(), dur: 900 };
    setTimeout(() => setStatus(`path simulated · ${sim.ticks.length} ticks · ${took.toFixed(0)} ms`, false), 950);
  } else {
    reveal = 1; revealAnim = null;
  }
}

function setStatus(text, busy) {
  const el = $('sim-status');
  el.textContent = text;
  el.classList.toggle('busy', !!busy);
}

function selectRoutine(name) {
  routine = name;
  start = readJSON(KEY.start(name), { ...DEFAULT_START });
  hooks = new Set(readJSON(KEY.hooks(name), []));
  timeMs = 0; playing = false; $('btn-play').textContent = 'Play';
  syncStartInputs();
  buildPresets();
  runSim(true);
  draw();
}

function poseAt(ms) {
  if (!sim) return { ...start };
  const T = sim.ticks;
  const i = Math.max(0, Math.min(T.length - 1, Math.round(ms / ROBOT.sim.tick_ms)));
  return T[i];
}

function robotCorners(p) {
  const L = ROBOT.length_in, W = ROBOT.width_in, off = ROBOT.center_offset_in;
  const a = p.h * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const cx = p.x - sa * off, cy = p.y - ca * off;
  return [[-W / 2, L / 2], [W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2]]
    .map(([u, v]) => ({ x: cx + u * ca + v * sa, y: cy - u * sa + v * ca }));
}

// ---------------------------------------------------------------------------
//  Warnings
// ---------------------------------------------------------------------------
function buildWarnings() {
  const box = $('warnings');
  box.innerHTML = '';
  if (!sim) return;

  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'warn ' + cls; d.innerHTML = html; box.appendChild(d); };

  if (sim.abort) {
    add('bad', `<b>Stopped at move #${sim.abort.move}</b><br>` +
      `Oblique contact with the ${sim.abort.name} at ${(sim.abort.t / 1000).toFixed(2)} s. ` +
      `What the robot does after a glancing hit is not predictable, so the path ends here ` +
      `rather than guessing. The line shown is everything up to the impact.` +
      `<br><span class="dim">If you have not placed the start pose yet, do that first — a routine ` +
      `started in the wrong corner will drive into a wall almost immediately.</span>`);
  }

  const solid = sim.contacts.filter(c => !c.unpredictable);
  if (solid.length) {
    const byName = {};
    for (const c of solid) (byName[c.name] = byName[c.name] || []).push(c);
    for (const name of Object.keys(byName)) {
      const list = byName[name];
      add('info', `<b>touches the ${name}</b> ${list.length}×, first at ` +
        `${(list[0].t / 1000).toFixed(2)} s <span class="dim">(square contact — squares the robot up)</span>`);
    }
  }

  if (!sim.abort && !solid.length) add('ok', 'no contact with anything on the field');

  const drift = sim.moves.length ? sim.moves[sim.moves.length - 1].headingEnd : 0;
  const asked = sim.moves.length ? sim.moves[sim.moves.length - 1].headingAsked + start.h : 0;
  const d = wrap180(drift - asked);
  if (Math.abs(d) > 3) add('bad', `<b>net heading drift ${d.toFixed(1)}°</b> at the end of the routine`);
}

// ---------------------------------------------------------------------------
//  Move table
// ---------------------------------------------------------------------------
function buildMovesTable() {
  const tb = $('moves');
  tb.innerHTML = '';
  if (!sim) return;
  let worst = 0, timeouts = 0;

  for (const m of sim.moves) {
    const tr = document.createElement('tr');
    const bad = m.type === 'drive' ? Math.abs(m.gap) > 2 : Math.abs(m.headingGap) > 2;
    if (m.exit === 'hung') tr.className = 'hung'; else if (bad) tr.className = 'bad';
    const f1 = (v) => (v === undefined ? '' : v.toFixed(1));
    const hookOn = hooks.has(m.i);
    const mark = m.contact ? (m.contact.unpredictable ? '✕' : '●') : '';
    tr.innerHTML = (m.type === 'drive'
      ? `<td>${m.i}</td><td>drive</td><td>${f1(m.asked)}</td><td>${f1(m.achieved)}</td><td>${f1(m.gap)}</td>`
      : `<td>${m.i}</td><td>turn</td><td>${f1(m.headingAsked)}°</td><td>${f1(m.headingEnd)}°</td><td>${f1(m.headingGap)}°</td>`)
      + `<td>${m.ms}</td><td>${m.exit}</td>`
      + `<td class="ct ${m.contact ? (m.contact.unpredictable ? 'x' : 'o') : ''}">${mark}</td>`
      + `<td><span class="hook ${hookOn ? 'on' : ''}" data-i="${m.i}" title="mark this move as an intended hook engagement, so long-goal contact is ignored">⌐</span></td>`;
    tr.onclick = (e) => {
      if (e.target.classList.contains('hook')) {
        const i = +e.target.dataset.i;
        hooks.has(i) ? hooks.delete(i) : hooks.add(i);
        writeJSON(KEY.hooks(routine), [...hooks]);
        runSim(false); draw();
        return;
      }
      const idx = sim.moves.indexOf(m);
      const k = sim.ticks.findIndex(t => t.move === idx);
      if (k >= 0) { timeMs = k * ROBOT.sim.tick_ms; playing = false; $('btn-play').textContent = 'Play'; draw(); }
    };
    tb.appendChild(tr);
    if (m.exit === 'timeout') timeouts++;
    if (m.type === 'drive') worst = Math.max(worst, Math.abs(m.gap));
  }

  $('sum-time').innerHTML = `<b>${(sim.duration_ms / 1000).toFixed(2)} s</b> total`;
  $('sum-moves').textContent = `${sim.moves.length} moves · ${timeouts} exit on timeout · worst drive gap ${worst.toFixed(1)} in`;
  const end = sim.ticks[sim.ticks.length - 1], ie = sim.intent[sim.intent.length - 1];
  $('sum-end').textContent = `sim ends ${Math.hypot(end.x - ie.x, end.y - ie.y).toFixed(1)} in from the intended end point`;
}

// ---------------------------------------------------------------------------
//  Start-pose presets
// ---------------------------------------------------------------------------
function buildPresets() {
  const wrap = $('presets');
  wrap.innerHTML = '';
  const list = readJSON(KEY.presets(routine), []);
  if (!list.length) { wrap.innerHTML = '<div class="hint">no saved placements yet</div>'; return; }
  list.forEach((p, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span class="nm" title="${p.x.toFixed(1)}, ${p.y.toFixed(1)} @ ${p.h.toFixed(0)}°">${p.name}</span><span class="del">×</span>`;
    chip.querySelector('.nm').onclick = () => {
      start = { x: p.x, y: p.y, h: p.h };
      writeJSON(KEY.start(routine), start);
      syncStartInputs(); runSim(false); draw();
    };
    chip.querySelector('.del').onclick = () => {
      list.splice(i, 1); writeJSON(KEY.presets(routine), list); buildPresets();
    };
    wrap.appendChild(chip);
  });
}

$('btn-remember').onclick = () => {
  const name = (prompt('Name this placement (e.g. "red left, 3 tiles from mat")', '') || '').trim();
  if (!name) return;
  const list = readJSON(KEY.presets(routine), []);
  list.push({ name, x: start.x, y: start.y, h: start.h });
  writeJSON(KEY.presets(routine), list);
  buildPresets();
};

// ---------------------------------------------------------------------------
//  Pointer handling
// ---------------------------------------------------------------------------
const measures = [];
let pending = null, panning = null, drag = null;
let mouse = { x: 0, y: 0, inside: false };
const ruler = { on: false, x: 35, y: 70.2, angle: 0, length: 46.8 };
const RULER_PX = 34;

const evPos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

function rulerPoints() {
  const a = ruler.angle * Math.PI / 180;
  return { a: { x: ruler.x, y: ruler.y }, b: { x: ruler.x + Math.sin(a) * ruler.length, y: ruler.y + Math.cos(a) * ruler.length } };
}
function hitRuler(p) {
  if (!ruler.on) return null;
  const { a, b } = rulerPoints(), A = toScreen(a.x, a.y), B = toScreen(b.x, b.y);
  if (Math.hypot(p.x - B.x, p.y - B.y) < 11) return 'ruler-tip';
  if (Math.hypot(p.x - A.x, p.y - A.y) < 11) return 'ruler-tip-a';
  const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1;
  const t = ((p.x - A.x) * vx + (p.y - A.y) * vy) / L2;
  if (t < 0 || t > 1) return null;
  const d = Math.hypot(p.x - (A.x + t * vx), p.y - (A.y + t * vy));
  return (d < RULER_PX && ((p.x - A.x) * vy - (p.y - A.y) * vx) > 0) ? 'ruler-body' : null;
}
function startHandlePos() {
  const a = start.h * Math.PI / 180, d = ROBOT.length_in * 0.5 + 8;
  return { x: start.x + d * Math.sin(a), y: start.y + d * Math.cos(a) };
}
function hitStart(p) {
  const k = startHandlePos(), K = toScreen(k.x, k.y);
  if (Math.hypot(p.x - K.x, p.y - K.y) < 10) return 'rotate';
  const f = toField(p.x, p.y);
  const a = -start.h * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const dx = f.x - start.x, dy = f.y - start.y;
  const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
  return (Math.abs(u) <= ROBOT.width_in / 2 && Math.abs(v) <= ROBOT.length_in / 2) ? 'move' : null;
}

canvas.addEventListener('mousedown', (e) => {
  const p = evPos(e);
  if (e.button === 2) return;
  if (e.shiftKey) { const f = toField(p.x, p.y); pending = { from: f, to: f }; return; }
  const hs = hitStart(p);
  if (hs) { drag = { kind: 'start-' + hs, grab: toField(p.x, p.y), x0: start.x, y0: start.y }; return; }
  const hr = hitRuler(p);
  if (hr) { drag = { kind: hr, grab: toField(p.x, p.y), x0: ruler.x, y0: ruler.y }; return; }
  panning = p;
});

canvas.addEventListener('mousemove', (e) => {
  const p = evPos(e);
  mouse = { x: p.x, y: p.y, inside: true };
  if (panning) { view.tx += p.x - panning.x; view.ty += p.y - panning.y; panning = p; }
  else if (pending) pending.to = toField(p.x, p.y);
  else if (drag) {
    const f = toField(p.x, p.y);
    if (drag.kind === 'start-move') {
      start.x = drag.x0 + (f.x - drag.grab.x); start.y = drag.y0 + (f.y - drag.grab.y);
      if (e.altKey) { const half = FIELD.TILE / 2; start.x = Math.round(start.x / half) * half; start.y = Math.round(start.y / half) * half; }
      queueSim();
    } else if (drag.kind === 'start-rotate') {
      let ang = Math.atan2(f.x - start.x, f.y - start.y) * 180 / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      start.h = ((ang % 360) + 360) % 360;
      queueSim();
    } else if (drag.kind === 'ruler-body') {
      ruler.x = drag.x0 + (f.x - drag.grab.x); ruler.y = drag.y0 + (f.y - drag.grab.y);
    } else {
      const anchor = drag.kind === 'ruler-tip' ? { x: ruler.x, y: ruler.y } : rulerPoints().b;
      const dx = f.x - anchor.x, dy = f.y - anchor.y;
      let ang = Math.atan2(dx, dy) * 180 / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      ruler.angle = (ang + 360) % 360; ruler.length = Math.max(6, Math.hypot(dx, dy));
      if (drag.kind === 'ruler-tip-a') { ruler.x = anchor.x; ruler.y = anchor.y; }
    }
  }
  draw();
});

// Re-simulating on every mouse move would fight the frame rate on the longer
// routines, so a drag coalesces into at most one run per animation frame.
let simQueued = false;
function queueSim() {
  syncStartInputs();
  if (simQueued) return;
  simQueued = true;
  requestAnimationFrame(() => { simQueued = false; runSim(false); draw(); });
}

window.addEventListener('mouseup', () => {
  if (pending) {
    if (Math.hypot(pending.to.x - pending.from.x, pending.to.y - pending.from.y) > 0.5) measures.push(pending);
    pending = null; $('measure-count').textContent = measures.length || 'none';
  }
  if (drag && drag.kind.startsWith('start')) { writeJSON(KEY.start(routine), start); runSim(false); }
  panning = null; drag = null; draw();
});
canvas.addEventListener('mouseleave', () => { mouse.inside = false; draw(); });
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const p = evPos(e);
  for (let i = measures.length - 1; i >= 0; i--) {
    const A = toScreen(measures[i].from.x, measures[i].from.y), B = toScreen(measures[i].to.x, measures[i].to.y);
    const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - A.x) * vx + (p.y - A.y) * vy) / L2));
    if (Math.hypot(p.x - (A.x + t * vx), p.y - (A.y + t * vy)) < 8) {
      measures.splice(i, 1); $('measure-count').textContent = measures.length || 'none'; draw(); return;
    }
  }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = evPos(e), before = toField(p.x, p.y);
  view.s = Math.max(1, Math.min(70, view.s * Math.exp(-e.deltaY * 0.0015)));
  view.tx = p.x - before.x * view.s; view.ty = p.y + before.y * view.s;
  draw();
}, { passive: false });

function syncStartInputs() {
  $('in-x').value = start.x.toFixed(1); $('in-y').value = start.y.toFixed(1); $('in-h').value = start.h.toFixed(1);
}
for (const [id, key] of [['in-x', 'x'], ['in-y', 'y'], ['in-h', 'h']]) {
  $(id).addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!isFinite(v)) return;
    start[key] = key === 'h' ? ((v % 360) + 360) % 360 : v;
    writeJSON(KEY.start(routine), start);
    runSim(false); draw();
  });
}

// ---------------------------------------------------------------------------
//  Drawing
// ---------------------------------------------------------------------------
function drawPaths() {
  if (!sim) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const revealTicks = Math.max(1, Math.floor(sim.ticks.length * reveal));
  const revealIntent = Math.max(1, Math.floor(sim.intent.length * reveal));

  if (showIntent) {
    ctx.save();
    ctx.strokeStyle = 'rgba(60,66,74,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    ctx.beginPath();
    for (let i = 0; i < revealIntent; i++) { const s = toScreen(sim.intent[i].x, sim.intent[i].y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(60,66,74,0.7)';
    for (let i = 0; i < revealIntent; i++) { const s = toScreen(sim.intent[i].x, sim.intent[i].y); ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  if (showSim) {
    const iNow = Math.min(revealTicks - 1, Math.round(timeMs / ROBOT.sim.tick_ms));
    const seg = (from, to, style, width) => {
      if (to <= from) return;
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = from; i <= to; i++) { const s = toScreen(sim.ticks[i].x, sim.ticks[i].y); i === from ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y); }
      ctx.stroke();
    };
    ctx.save();
    seg(iNow, revealTicks - 1, 'rgba(47,111,176,0.30)', 2);
    seg(0, iNow, 'rgba(47,111,176,0.95)', 2.5);
    ctx.restore();

    // the leading edge, while the path is still drawing itself
    if (reveal < 1) {
      const p = sim.ticks[revealTicks - 1], s = toScreen(p.x, p.y);
      ctx.save();
      ctx.fillStyle = '#2f6fb0'; ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(47,111,176,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // contact markers
  ctx.save();
  for (const c of sim.contacts) {
    const i = Math.min(revealTicks - 1, Math.round(c.t / ROBOT.sim.tick_ms));
    if (i * ROBOT.sim.tick_ms < c.t - 1) continue;
    const p = sim.ticks[i], s = toScreen(p.x, p.y);
    ctx.fillStyle = c.unpredictable ? '#c8273a' : '#e0892d';
    ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();

  if (showEvents) {
    ctx.save();
    ctx.font = '9px "JetBrains Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
    for (const ev of sim.events) {
      if (ev.tick > revealTicks) continue;
      const a = ev.action;
      let label = null, color = null;
      if (a.type === 'pneumatic') { label = `${a.name} ${a.state ? 'on' : 'off'}`; color = a.state ? '#c8721a' : '#8a8f96'; }
      if (a.type === 'motor' && a.name === 'intake') { label = a.action === 'stop' ? 'intake stop' : 'intake'; color = '#2a9d5c'; }
      if (!label) continue;
      const s = toScreen(ev.x, ev.y);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
      if (view.s > 5) ctx.fillText(label, s.x + 6, s.y);
    }
    ctx.restore();
  }
}

function drawRobot(p, opts) {
  const c = robotCorners(p).map(q => toScreen(q.x, q.y));
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
  ctx.fillStyle = opts.fill; ctx.fill();
  ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.outline || 1.5; ctx.stroke();
  const mid = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const cc = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
  ctx.strokeStyle = opts.front; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); ctx.lineTo(c[1].x, c[1].y); ctx.stroke();   // front
  ctx.strokeStyle = opts.stroke; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cc.x, cc.y); ctx.lineTo(mid(c[0], c[1], 0.5).x, mid(c[0], c[1], 0.5).y); ctx.stroke();
  for (const k of [0.3, 0.7]) {                                                            // rear ticks
    const r = mid(c[3], c[2], k), inw = mid(r, cc, 0.18);
    ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(inw.x, inw.y); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cc.x, cc.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = opts.stroke; ctx.fill();
  ctx.restore();
}

function drawStartHandle() {
  const k = startHandlePos(), K = toScreen(k.x, k.y), S = toScreen(start.x, start.y);
  ctx.save();
  ctx.strokeStyle = 'rgba(47,111,176,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(K.x, K.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(K.x, K.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#2f6fb0'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

const TICK_LADDER = [FIELD.TILE, FIELD.TILE / 2, 6, 3, 1];
function drawEdgeRulers() {
  const W = canvas.clientWidth, H = canvas.clientHeight, css = getComputedStyle(document.documentElement);
  let step = FIELD.TILE; for (const t of TICK_LADDER) if (t * view.s >= 55) step = t;
  ctx.save();
  ctx.fillStyle = css.getPropertyValue('--gutter').trim(); ctx.fillRect(0, 0, W, MARGIN); ctx.fillRect(0, 0, MARGIN, H);
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = css.getPropertyValue('--muted').trim();
  ctx.strokeStyle = css.getPropertyValue('--hair').trim(); ctx.lineWidth = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let x = 0; x <= FIELD.SIZE + 0.01; x += step) {
    const sx = toScreen(x, 0).x; if (sx < MARGIN - 2 || sx > W) continue;
    ctx.beginPath(); ctx.moveTo(sx, MARGIN - 5); ctx.lineTo(sx, MARGIN); ctx.stroke();
    ctx.fillText(x.toFixed(0), sx, MARGIN - 6);
  }
  ctx.textBaseline = 'top';
  for (let y = 0; y <= FIELD.SIZE + 0.01; y += step) {
    const sy = toScreen(0, y).y; if (sy < MARGIN || sy > H) continue;
    ctx.beginPath(); ctx.moveTo(MARGIN - 5, sy); ctx.lineTo(MARGIN, sy); ctx.stroke();
    ctx.save(); ctx.translate(MARGIN - 7, sy); ctx.rotate(-Math.PI / 2); ctx.fillText(y.toFixed(0), 0, 0); ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.fillText('in', 5, 5);
  ctx.restore();
}

function drawRuler() {
  if (!ruler.on) return;
  const { a, b } = rulerPoints(), A = toScreen(a.x, a.y), B = toScreen(b.x, b.y);
  const len = Math.hypot(B.x - A.x, B.y - A.y), ang = Math.atan2(B.y - A.y, B.x - A.x);
  ctx.save(); ctx.translate(A.x, A.y); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(60,110,170,0.16)'; ctx.fillRect(0, 0, len, RULER_PX);
  ctx.strokeStyle = 'rgba(40,90,150,0.65)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,90,150,0.30)'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, len, RULER_PX);
  ctx.strokeStyle = 'rgba(30,70,120,0.55)'; ctx.fillStyle = 'rgba(30,70,120,0.85)';
  ctx.font = '9px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const stepIn = view.s > 9 ? 1 : (view.s > 4 ? 3 : 6);
  for (let i = 0; i <= ruler.length + 0.001; i += stepIn) {
    const px = i * view.s; if (px > len + 0.5) break;
    const major = Math.abs(i % (stepIn === 1 ? 6 : stepIn * 2)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, major ? 11 : 6); ctx.stroke();
    if (major && len > 40) ctx.fillText(i.toFixed(0), px, 12);
  }
  ctx.restore();
  for (const pt of [A, B]) { ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2); ctx.fillStyle = '#2f6fb0'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  $('ruler-readout').textContent = `${ruler.length.toFixed(1)}" @ ${ruler.angle.toFixed(1)}° from (${ruler.x.toFixed(1)}, ${ruler.y.toFixed(1)})`;
}

function drawOneMeasure(m) {
  const A = toScreen(m.from.x, m.from.y), B = toScreen(m.to.x, m.to.y);
  const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y, len = Math.hypot(dx, dy);
  const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  ctx.save();
  ctx.strokeStyle = '#d97a17'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  for (const p of [A, B]) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#d97a17'; ctx.fill(); }
  const txt = `${len.toFixed(2)}"  ${(len / FIELD.TILE).toFixed(2)} tiles  @ ${bearing.toFixed(1)}°`;
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
  const w = ctx.measureText(txt).width + 12, mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  ctx.fillRect(mx - w / 2, my - 26, w, 18); ctx.strokeRect(mx - w / 2, my - 26, w, 18);
  ctx.fillStyle = '#8a4a08'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, mx, my - 17);
  ctx.restore();
}

function drawCrosshair() {
  if (!mouse.inside || mouse.x < MARGIN || mouse.y < MARGIN) return;
  const f = toField(mouse.x, mouse.y);
  $('cursor-in').textContent = `${f.x.toFixed(1)}, ${f.y.toFixed(1)}`;
  $('cursor-tile').textContent = `${(f.x / FIELD.TILE).toFixed(2)}, ${(f.y / FIELD.TILE).toFixed(2)}`;
  ctx.save(); ctx.strokeStyle = 'rgba(40,110,190,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, mouse.y); ctx.lineTo(canvas.clientWidth, mouse.y);
  ctx.moveTo(mouse.x, MARGIN); ctx.lineTo(mouse.x, canvas.clientHeight);
  ctx.stroke(); ctx.restore();
}

function draw() {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  const css = getComputedStyle(document.documentElement);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = css.getPropertyValue('--stage').trim(); ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.setTransform(dpr * view.s, 0, 0, -dpr * view.s, dpr * view.tx, dpr * view.ty);
  drawField(ctx, view.s, null);
  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPaths();

  if (sim) {
    drawRobot({ ...start }, { alpha: 0.35, fill: 'rgba(47,111,176,0.25)', stroke: '#2f6fb0', front: '#2f6fb0' });
    drawStartHandle();
    const p = poseAt(Math.min(timeMs, (Math.max(1, Math.floor(sim.ticks.length * reveal)) - 1) * ROBOT.sim.tick_ms));
    const touching = sim.contacts.some(c => Math.abs(c.t - timeMs) < 120);
    drawRobot(p, { alpha: 1, fill: 'rgba(255,255,255,0.86)', stroke: touching ? '#d9283c' : '#1c2128',
                   front: touching ? '#d9283c' : '#2f6fb0', outline: touching ? 3 : 1.5 });
    $('time-readout').textContent = `${(timeMs / 1000).toFixed(2)} s   x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  h ${(((p.h % 360) + 360) % 360).toFixed(1)}°`;
    $('timeline').value = timeMs;
  }

  drawEdgeRulers(); drawRuler();
  for (const m of measures) drawOneMeasure(m);
  if (pending) drawOneMeasure(pending);
  drawCrosshair();
  $('zoom').textContent = view.s.toFixed(2) + ' px/in';
}

// ---------------------------------------------------------------------------
//  Frame loop: playback and the reveal animation
// ---------------------------------------------------------------------------
function frame(now) {
  let dirty = false;
  if (revealAnim) {
    const k = Math.min(1, (now - revealAnim.t0) / revealAnim.dur);
    reveal = 1 - Math.pow(1 - k, 3);                       // ease out
    if (k >= 1) { reveal = 1; revealAnim = null; }
    dirty = true;
  }
  if (playing && sim) {
    timeMs += (lastFrame ? now - lastFrame : 0) * parseFloat($('speed').value);
    if (timeMs >= sim.duration_ms) { timeMs = sim.duration_ms; playing = false; $('btn-play').textContent = 'Play'; }
    dirty = true;
  }
  if (dirty) draw();
  lastFrame = now;
  requestAnimationFrame(frame);
}

$('btn-play').onclick = () => {
  if (!sim) return;
  if (timeMs >= sim.duration_ms) timeMs = 0;
  playing = !playing; $('btn-play').textContent = playing ? 'Pause' : 'Play';
};
$('btn-restart').onclick = () => { timeMs = 0; playing = false; $('btn-play').textContent = 'Play'; draw(); };
$('btn-replay').onclick = () => { runSim(true); draw(); };
$('timeline').addEventListener('input', (e) => { timeMs = parseFloat(e.target.value); playing = false; $('btn-play').textContent = 'Play'; draw(); });

// ---------------------------------------------------------------------------
//  Controls
// ---------------------------------------------------------------------------
const sel = $('routine');
for (const name of Object.keys(LOGS)) { const o = document.createElement('option'); o.value = o.textContent = name; sel.appendChild(o); }
sel.onchange = (e) => selectRoutine(e.target.value);

$('btn-fit').onclick = fitView;
$('btn-default-start').onclick = () => { start = { ...DEFAULT_START }; writeJSON(KEY.start(routine), start); syncStartInputs(); runSim(false); draw(); };
$('btn-ruler').onclick = (e) => { ruler.on = !ruler.on; e.target.classList.toggle('active', ruler.on); if (!ruler.on) $('ruler-readout').textContent = 'off'; draw(); };
$('btn-clear').onclick = () => { measures.length = 0; $('measure-count').textContent = 'none'; draw(); };
$('btn-theme').onclick = (e) => {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t; setTheme(t);
  e.target.textContent = t === 'light' ? 'Dark' : 'Light'; draw();
};
$('chk-intent').onchange = (e) => { showIntent = e.target.checked; draw(); };
$('chk-sim').onchange    = (e) => { showSim = e.target.checked; draw(); };
$('chk-events').onchange = (e) => { showEvents = e.target.checked; draw(); };

for (const [id, key, fmt] of [['sl-load', 'load_factor', v => v.toFixed(2)],
                              ['sl-tau', 'tau_s', v => v.toFixed(2) + ' s'],
                              ['sl-dead', 'v_dead', v => v.toFixed(2) + ' V']]) {
  const el = $(id), out = $(id + '-v');
  el.value = ROBOT.sim[key]; out.textContent = fmt(ROBOT.sim[key]);
  el.addEventListener('input', (e) => {
    ROBOT.sim[key] = parseFloat(e.target.value); out.textContent = fmt(ROBOT.sim[key]);
    runSim(false); draw();
  });
}

window.addEventListener('resize', resize);
setTheme('light');
if (routine) { sel.value = routine; selectRoutine(routine); }
else { setStatus('no logs found — run build.bat first', false); }
resize();
requestAnimationFrame(frame);
