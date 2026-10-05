// ============================================================================
//  viewer/viewer.js  --  camera, playback, placement, code panel, tools
// ----------------------------------------------------------------------------
//  Data flow:
//     out/logs.js  +  start pose  ->  simulate()  ->  ticks in FIELD coords
//     out/source.js                ->  the code panel
//     out/profile.js               ->  robot.js (already merged into ROBOT)
//
//  The start pose is an input to the simulation, not a transform applied
//  afterwards: the robot collides with real obstacles, so where it starts
//  changes what it hits. Dragging therefore re-runs the simulation -- but only
//  a routine or model change replays the drawing animation.
//
//  Every recorded action carries the file and line that produced it (the
//  compiler filled them in -- see mock/vex.h). That is what joins the path, the
//  moves table and the code panel together.
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
//  What the build produced
// ---------------------------------------------------------------------------
const LOGS   = window.VEXSIM_LOGS   || {};
const SOURCE = window.VEXSIM_SOURCE || {};
const BUILD  = window.VEXSIM_BUILD  || null;
const TEAM   = ROBOT.team || 'team';

// ---------------------------------------------------------------------------
//  Saved settings. Scoped by team, so two teams' routines that share a name
//  (every template has a test()) keep separate placements. Our settings from
//  before scoping existed are still read, so nothing already saved is lost.
// ---------------------------------------------------------------------------
function storageWorks() {
  try {
    localStorage.setItem('vexsim.probe', '1');
    const ok = localStorage.getItem('vexsim.probe') === '1';
    localStorage.removeItem('vexsim.probe');
    return ok;
  } catch (e) { return false; }
}
const readRaw  = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const key = (kind, r) => `vexsim.${TEAM}.${kind}` + (r ? '.' + r : '');
function readSaved(kind, r, fallback) {
  let v = readRaw(key(kind, r));
  if (v == null && TEAM === '117V') v = readRaw('vexsim.' + kind + (r ? '.' + r : ''));   // pre-scoping
  return v == null ? fallback : v;
}

// The drivetrain constants are a calibration, not a preference.
const MODEL_DEFAULTS = { load_factor: ROBOT.sim.load_factor, tau_s: ROBOT.sim.tau_s, v_dead: ROBOT.sim.v_dead };
Object.assign(ROBOT.sim, readSaved('model', null, {}));

// ---------------------------------------------------------------------------
//  Routine state
// ---------------------------------------------------------------------------
const DEFAULT_START = { x: 24, y: 24, h: 0 };

// Start placements written into the team's profile. Each may name its mirror:
// the same pose turned 180° about the field centre, which is the other
// alliance's matching start. Gyro-relative code runs identically from there; a
// left-right reflection would not, because every turn would reverse.
function profileStarts(r) {
  const out = [];
  for (const p of (ROBOT.starts && ROBOT.starts[r]) || []) {
    out.push({ name: p.name, x: p.x, y: p.y, h: p.h });
    if (p.mirror) out.push({ name: p.mirror, x: FIELD.SIZE - p.x, y: FIELD.SIZE - p.y, h: (p.h + 180) % 360 });
  }
  return out;
}
function defaultStart(r) {
  const s = profileStarts(r)[0];
  return s ? { x: s.x, y: s.y, h: s.h } : { ...DEFAULT_START };
}
let routine = null, sim = null;
let start = { ...DEFAULT_START };
let hooks = new Set();                 // action indices whose goal contact is intended
let timeMs = 0, playing = false, lastFrame = 0;
let showIntent = true, showSim = true, showEvents = true;
let reveal = 1, revealAnim = null;     // 0..1 progressive draw of the path

const actionOf = (i) => (LOGS[routine] && LOGS[routine].actions[i]) || null;

function runSim(animate) {
  if (!routine) return;
  const t0 = performance.now();
  sim = simulate(LOGS[routine], ROBOT, start, { hooks });
  const took = performance.now() - t0;

  timeMs = Math.min(timeMs, sim.duration_ms);
  $('timeline').max = sim.duration_ms;
  buildMovesTable();
  buildWarnings();
  markCodeLines();

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
  writeJSON(key('last'), name);
  start = readSaved('start', name, defaultStart(name));
  hooks = new Set(readSaved('hooks', name, []));
  timeMs = 0; playing = false; $('btn-play').textContent = 'Play';
  syncStartInputs();
  buildPresets();
  runSim(true);
  draw();
}

function poseAt(ms) {
  if (!sim) return { ...start };
  const T = sim.ticks;
  return T[Math.max(0, Math.min(T.length - 1, Math.round(ms / ROBOT.sim.tick_ms)))];
}

function robotCorners(p) {
  const L = ROBOT.length_in, W = ROBOT.width_in, off = ROBOT.center_offset_in;
  const a = p.h * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const cx = p.x - sa * off, cy = p.y - ca * off;
  return [[-W / 2, L / 2], [W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2]]
    .map(([u, v]) => ({ x: cx + u * ca + v * sa, y: cy - u * sa + v * ca }));
}

function jumpTo(ms) {
  timeMs = Math.max(0, Math.min(ms, sim ? sim.duration_ms : 0));
  playing = false; $('btn-play').textContent = 'Play';
  draw();
}

// ---------------------------------------------------------------------------
//  Warnings
// ---------------------------------------------------------------------------
const lineRef = (a) => a ? `<a class="lnk" data-file="${a.file}" data-line="${a.line}">${a.file}:${a.line}</a>` : '';

function buildWarnings() {
  const box = $('warnings');
  box.innerHTML = '';
  if (!sim) return;
  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'warn ' + cls; d.innerHTML = html; box.appendChild(d); };

  if (LOGS[routine].overran)
    add('bad', `<b>This routine never finished.</b> It was still running after 3 minutes of simulated time, ` +
               `which almost always means a <code>waitUntil()</code> on a sensor — and no sensor ever changes in ` +
               `simulation. Everything up to that point is shown.`);

  if (sim.abort && sim.abort.reason === 'unsimulated') {
    add('bad', `<b>Path ends at ${lineRef(actionOf(sim.abort.move))}</b><br>` +
      `<code>${sim.abort.name}()</code> steers by odometry, which is not simulated yet, so where the robot ` +
      `goes from here would be a guess.`);
  } else if (sim.abort) {
    add('bad', `<b>Stopped at ${lineRef(actionOf(sim.abort.move))}</b><br>` +
      `Oblique contact with the ${sim.abort.name} at ${(sim.abort.t / 1000).toFixed(2)} s. ` +
      `What a robot does after a glancing hit is not predictable, so the path ends here rather than ` +
      `guessing. The line shown is everything up to the impact.` +
      `<br><span class="dim">If you have not placed the start pose yet, do that first — a routine ` +
      `started in the wrong corner will drive into a wall almost immediately.</span>`);
  }

  const solid = sim.contacts.filter(c => !c.unpredictable);
  const byName = {};
  for (const c of solid) (byName[c.name] = byName[c.name] || []).push(c);
  for (const name of Object.keys(byName)) {
    const list = byName[name];
    add('info', `<b>touches the ${name}</b> ${list.length}×, first at ${lineRef(actionOf(list[0].move))} ` +
      `<span class="dim">(square contact — squares the robot up)</span>`);
  }
  if (!sim.abort && !solid.length) add('ok', 'no contact with anything on the field');

  // Headings are reported in the code's own gyro frame, so they compare directly.
  const last = sim.moves[sim.moves.length - 1];
  if (last && Math.abs(last.headingGap) > 3)
    add('bad', `<b>finishes ${last.headingGap.toFixed(1)}° short of the last commanded heading</b> ` +
               `<span class="dim">(asked ${last.headingAsked}°, reached ${last.headingEnd.toFixed(1)}° — ${lineRef(actionOf(last.i))})</span>`);

  const turns = sim.moves.filter(m => m.type !== 'drive');
  const worst = turns.reduce((w, m) => Math.abs(m.headingGap) > Math.abs(w.headingGap || 0) ? m : w, {});
  if (worst.headingGap !== undefined && Math.abs(worst.headingGap) > 3)
    add('info', `worst turn ends <b>${worst.headingGap.toFixed(1)}°</b> off target at ${lineRef(actionOf(worst.i))}`);

  if (sim.pickups.length || sim.releases.length) {
    const fromLoader = sim.pickups.filter(p => p.from === 'loader').length;
    add('info', `intake sweeps <b>${sim.pickups.length}</b> block${sim.pickups.length === 1 ? '' : 's'}` +
                (fromLoader ? ` (${fromLoader} from a loader)` : '') + ` and ejects <b>${sim.releases.length}</b>`);
  }
}

// Line references anywhere in the sidebar open the code panel at that line.
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('.lnk');
  if (!a) return;
  e.preventDefault();
  openCode(a.dataset.file, +a.dataset.line, true);
});

// ---------------------------------------------------------------------------
//  Move table
// ---------------------------------------------------------------------------
function buildMovesTable() {
  const tb = $('moves');
  tb.innerHTML = '';
  if (!sim) return;
  let worst = 0, timeouts = 0;

  for (const m of sim.moves) {
    const a = actionOf(m.i);
    const tr = document.createElement('tr');
    const bad = m.type === 'drive' ? Math.abs(m.gap) > 2 : Math.abs(m.headingGap) > 2;
    if (m.exit === 'hung') tr.className = 'hung'; else if (bad) tr.className = 'bad';
    const f1 = (v) => (v === undefined ? '' : v.toFixed(1));
    const hookOn = hooks.has(m.i);
    const mark = m.contact ? (m.contact.unpredictable ? '✕' : '●') : '';
    const kind = m.type === 'swing' ? (m.side === 'left' ? 'swing L' : 'swing R') : m.type;
    tr.innerHTML =
        `<td>${a ? `<a class="lnk" data-file="${a.file}" data-line="${a.line}">${a.line}</a>` : ''}</td><td>${kind}</td>`
      + (m.type === 'drive'
          ? `<td>${f1(m.asked)}</td><td>${f1(m.achieved)}</td><td>${f1(m.gap)}</td>`
          : `<td>${f1(m.headingAsked)}°</td><td>${f1(m.headingEnd)}°</td><td>${f1(m.headingGap)}°</td>`)
      + `<td>${m.ms}</td><td>${m.exit}</td>`
      + `<td class="ct ${m.contact ? (m.contact.unpredictable ? 'x' : 'o') : ''}">${mark}</td>`
      + `<td><span class="hook ${hookOn ? 'on' : ''}" data-i="${m.i}" title="mark as an intended hook engagement: long-goal contact is then ignored">⌐</span></td>`;
    tr.onclick = (e) => {
      if (e.target.classList.contains('lnk')) return;          // handled globally
      if (e.target.classList.contains('hook')) {
        const i = +e.target.dataset.i;
        hooks.has(i) ? hooks.delete(i) : hooks.add(i);
        writeJSON(key('hooks', routine), [...hooks]);
        runSim(false); draw();
        return;
      }
      const span = sim.spans.find(s => s.i === m.i);
      if (span) jumpTo(span.t0);
      if (a && codeOpen) showCodeLine(a.file, a.line, true);
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
//  The code panel
//
//  Shows the team's own files, read-only, exactly as compiled. Lines that
//  produced an action get a dot in the gutter; clicking one jumps the timeline
//  to when it ran (again, to the next time it ran). During playback the line
//  currently executing is highlighted. Editing happens in VEXcode: save,
//  rebuild, refresh.
// ---------------------------------------------------------------------------
let codeOpen = false, codeFile = null, codeEls = [], codeHot = null;
const CODE_FILES = Object.keys(SOURCE).sort((a, b) =>
  (a === 'autons.cpp' ? -1 : b === 'autons.cpp' ? 1 : a.localeCompare(b)));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const KW = new Set(['void', 'int', 'float', 'double', 'bool', 'char', 'auto', 'const', 'static', 'if', 'else',
  'while', 'for', 'do', 'return', 'break', 'continue', 'switch', 'case', 'default', 'true', 'false',
  'struct', 'class', 'using', 'namespace', 'new', 'delete', 'this', 'enum']);

// A small highlighter: comments, strings, numbers, keywords, calls. Enough to
// read by, and it carries /* ... */ across lines.
function highlight(line, st) {
  const t = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;
  if (!st.inBlock && /^\s*#/.test(line)) return t('pp', line);
  let out = '', i = 0;
  while (i < line.length) {
    if (st.inBlock) {
      const e = line.indexOf('*/', i);
      if (e < 0) { out += t('cm', line.slice(i)); break; }
      out += t('cm', line.slice(i, e + 2)); i = e + 2; st.inBlock = false; continue;
    }
    if (line.startsWith('//', i)) { out += t('cm', line.slice(i)); break; }
    if (line.startsWith('/*', i)) { st.inBlock = true; out += t('cm', '/*'); i += 2; continue; }
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === '\\' ? 2 : 1;
      out += t('st', line.slice(i, j + 1)); i = j + 1; continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] || ''))) {
      let j = i; while (j < line.length && /[0-9.a-fA-FxX]/.test(line[j])) j++;
      out += t('nu', line.slice(i, j)); i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i; while (j < line.length && /\w/.test(line[j])) j++;
      const w = line.slice(i, j);
      out += KW.has(w) ? t('kw', w) : (line[j] === '(' ? t('fn', w) : esc(w));
      i = j; continue;
    }
    out += esc(ch); i++;
  }
  return out;
}

function renderCode(file) {
  codeFile = file;
  const body = $('code-body');
  const lines = (SOURCE[file] || '').split(/\r?\n/);
  const st = { inBlock: false };
  body.innerHTML = lines.map((l, k) =>
    `<div class="cl" data-l="${k + 1}"><span class="ln">${k + 1}</span><span class="gm"></span>` +
    `<span class="lc">${highlight(l, st) || ' '}</span></div>`).join('');
  codeEls = [null, ...body.children];
  codeHot = null;
  $('code-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.f === file));
  markCodeLines();
}

// Gutter dots: every line in this file that produced an action this run.
function markCodeLines() {
  if (!codeOpen || !codeFile || !sim) return;
  for (let k = 1; k < codeEls.length; k++) codeEls[k].classList.remove('act', 'mv');
  for (const s of sim.spans) {
    if (s.file !== codeFile || !codeEls[s.line]) continue;
    codeEls[s.line].classList.add('act');
    if (s.type === 'drive' || s.type === 'turn' || s.type === 'swing') codeEls[s.line].classList.add('mv');
  }
}

function showCodeLine(file, line, scroll) {
  if (file !== codeFile) renderCode(file);
  if (codeHot && codeEls[codeHot]) codeEls[codeHot].classList.remove('hot');
  codeHot = line;
  const el = codeEls[line];
  if (!el) return;
  el.classList.add('hot');
  if (scroll) {
    const body = $('code-body');
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    if (top < body.scrollTop + 30 || bottom > body.scrollTop + body.clientHeight - 30)
      body.scrollTop = top - body.clientHeight / 2;
  }
}

function openCode(file, line, jump) {
  if (!CODE_FILES.length) return;
  if (!codeOpen) toggleCode(true);
  showCodeLine(file || codeFile || CODE_FILES[0], line || 1, true);
  if (jump && sim && line) {
    const s = sim.spans.find(x => x.file === (file || codeFile) && x.line === line);
    if (s) jumpTo(s.t0);
  }
}

function toggleCode(on) {
  codeOpen = on === undefined ? !codeOpen : on;
  $('code').classList.toggle('hidden', !codeOpen);
  $('btn-code').classList.toggle('active', codeOpen);
  if (codeOpen && !codeFile && CODE_FILES.length) renderCode(CODE_FILES[0]);
  markCodeLines();
  resize();
}

// The line running at the current time: the latest action in the shown file
// that has started by now.
function followCode() {
  if (!codeOpen || !sim) return;
  let cur = null;
  for (const s of sim.spans) {
    if (s.t0 > timeMs) break;
    if (s.file === codeFile) cur = s;
  }
  if (cur && cur.line !== codeHot) showCodeLine(codeFile, cur.line, true);
}

$('code-tabs').innerHTML = CODE_FILES.map(f => `<button data-f="${f}">${f}</button>`).join('');
$('code-tabs').onclick = (e) => { const f = e.target.dataset && e.target.dataset.f; if (f) renderCode(f); };
$('btn-code').onclick = () => toggleCode();
$('btn-code-close').onclick = () => toggleCode(false);
$('code-body').onclick = (e) => {
  const row = e.target.closest('.cl');
  if (!row || !sim) return;
  const line = +row.dataset.l;
  const hits = sim.spans.filter(s => s.file === codeFile && s.line === line);
  if (!hits.length) return;
  // click again to step to the next time this line runs
  const next = hits.find(s => s.t0 > timeMs + 1) || hits[0];
  showCodeLine(codeFile, line, false);
  jumpTo(next.t0);
};
if (!CODE_FILES.length) $('btn-code').title = 'no source in out/source.js -- run build.bat';

// ---------------------------------------------------------------------------
//  Start-pose presets
// ---------------------------------------------------------------------------
function buildPresets() {
  const wrap = $('presets');
  wrap.innerHTML = '';
  const fixed = profileStarts(routine);           // from the profile: cannot be deleted here
  const list = readSaved('presets', routine, []); // saved in this browser
  if (!fixed.length && !list.length) { wrap.innerHTML = '<div class="hint">no saved placements yet</div>'; return; }
  const chip = (p, onDelete) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `<span class="nm" title="${p.x.toFixed(1)}, ${p.y.toFixed(1)} @ ${p.h.toFixed(0)}°">${esc(p.name)}</span>` +
                  (onDelete ? '<span class="del">×</span>' : '');
    c.querySelector('.nm').onclick = () => {
      start = { x: p.x, y: p.y, h: p.h };
      writeJSON(key('start', routine), start);
      syncStartInputs(); runSim(false); draw();
    };
    if (onDelete) c.querySelector('.del').onclick = onDelete;
    wrap.appendChild(c);
  };
  fixed.forEach((p) => chip(p, null));
  list.forEach((p, i) => chip(p, () => {
    list.splice(i, 1); writeJSON(key('presets', routine), list); buildPresets();
  }));
}

$('btn-remember').onclick = () => {
  const name = (prompt('Name this placement (e.g. "red left, 3 tiles from mat")', '') || '').trim();
  if (!name) return;
  const list = readSaved('presets', routine, []);
  list.push({ name, x: start.x, y: start.y, h: start.h });
  writeJSON(key('presets', routine), list);
  buildPresets();
};

// ---------------------------------------------------------------------------
//  A link to exactly this view: routine, placement, time, code panel. Send it
//  to a teammate and they see the same thing -- nothing is uploaded anywhere,
//  it is all in the address.
// ---------------------------------------------------------------------------
function viewLink() {
  const q = new URLSearchParams({
    routine, x: start.x.toFixed(1), y: start.y.toFixed(1), h: start.h.toFixed(1),
    t: (timeMs / 1000).toFixed(2),
  });
  if (codeOpen) q.set('code', codeFile || '1');
  return location.href.split('#')[0] + '#' + q.toString();
}
$('btn-link').onclick = async () => {
  const url = viewLink();
  try { await navigator.clipboard.writeText(url); setStatus('link to this view copied', false); }
  catch (e) { prompt('Copy this link:', url); }
};
function applyLink() {
  if (!location.hash) return false;
  const q = new URLSearchParams(location.hash.slice(1));
  const r = q.get('routine');
  if (!r || !LOGS[r]) return false;
  sel.value = r;
  selectRoutine(r);
  const x = parseFloat(q.get('x')), y = parseFloat(q.get('y')), h = parseFloat(q.get('h'));
  if (isFinite(x) && isFinite(y) && isFinite(h)) { start = { x, y, h }; syncStartInputs(); runSim(false); }
  const t = parseFloat(q.get('t'));
  if (isFinite(t)) timeMs = Math.min(t * 1000, sim.duration_ms);
  const code = q.get('code');
  if (code) { toggleCode(true); if (SOURCE[code]) renderCode(code); }
  return true;
}

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

// A drag coalesces into at most one re-simulation per animation frame.
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
  if (drag && drag.kind.startsWith('start')) { writeJSON(key('start', routine), start); runSim(false); }
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
for (const [id, k] of [['in-x', 'x'], ['in-y', 'y'], ['in-h', 'h']]) {
  $(id).addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!isFinite(v)) return;
    start[k] = k === 'h' ? ((v % 360) + 360) % 360 : v;
    writeJSON(key('start', routine), start);
    runSim(false); draw();
  });
}

// ---------------------------------------------------------------------------
//  Drawing
// ---------------------------------------------------------------------------
// Motors worth labelling on the path: the ones the profile's intake rules name.
const INTAKE_MOTORS = new Set([...Object.keys(ROBOT.intake.collect_when || {}),
                               ...Object.keys(ROBOT.intake.eject_when || {})]);

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

    if (reveal < 1) {                              // the leading edge while drawing
      const p = sim.ticks[revealTicks - 1], s = toScreen(p.x, p.y);
      ctx.save();
      ctx.fillStyle = '#2f6fb0'; ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(47,111,176,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  ctx.save();                                      // contact markers
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
      if (a.type === 'motor' && INTAKE_MOTORS.has(a.name)) { label = a.action === 'stop' ? `${a.name} stop` : a.name; color = '#2a9d5c'; }
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

  // Blocks the capture zone has already swept are inside the robot.
  const iNow = sim ? Math.min(sim.ticks.length - 1, Math.round(timeMs / ROBOT.sim.tick_ms)) : 0;
  const swept = new Set();
  if (sim) for (const p of sim.pickups) if (p.tick <= iNow) swept.add(p.id);

  ctx.save();
  ctx.setTransform(dpr * view.s, 0, 0, -dpr * view.s, dpr * view.tx, dpr * view.ty);
  drawField(ctx, view.s, swept);
  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPaths();

  if (sim) {
    const now = sim.ticks[iNow];
    const poly = (pts, fill, stroke) => {
      ctx.save();
      ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    };
    // The plate while deployed, then the capture zone -- kept deliberately
    // faint: it shows where the robot is TRYING to collect, nothing more.
    if (now && now.pl)
      poly(plateZone(now, ROBOT).map(q => toScreen(q.x, q.y)), 'rgba(120,132,148,0.22)', 'rgba(90,102,118,0.45)');
    if (now && now.ik === 1)
      poly(intakeWedge(now, ROBOT).map(q => toScreen(q.x, q.y)), 'rgba(42,157,92,0.12)', 'rgba(42,157,92,0.34)');
    $('carried').textContent = sim.carried[iNow] + ' / ' + sim.capacity;

    drawRobot({ ...start }, { alpha: 0.35, fill: 'rgba(47,111,176,0.25)', stroke: '#2f6fb0', front: '#2f6fb0' });
    drawStartHandle();
    const p = poseAt(Math.min(timeMs, (Math.max(1, Math.floor(sim.ticks.length * reveal)) - 1) * ROBOT.sim.tick_ms));
    const touching = sim.contacts.some(c => Math.abs(c.t - timeMs) < 120);
    drawRobot(p, { alpha: 1, fill: 'rgba(255,255,255,0.86)', stroke: touching ? '#d9283c' : '#1c2128',
                   front: touching ? '#d9283c' : '#2f6fb0', outline: touching ? 3 : 1.5 });
    $('time-readout').textContent = `${(timeMs / 1000).toFixed(2)} s   x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  h ${(((p.h % 360) + 360) % 360).toFixed(1)}°`;
    $('timeline').value = timeMs;
    followCode();
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
$('btn-restart').onclick = () => jumpTo(0);
$('btn-replay').onclick = () => { runSim(true); draw(); };
$('timeline').addEventListener('input', (e) => jumpTo(parseFloat(e.target.value)));

// ---------------------------------------------------------------------------
//  Controls
// ---------------------------------------------------------------------------
const sel = $('routine');
for (const name of Object.keys(LOGS)) { const o = document.createElement('option'); o.value = o.textContent = name; sel.appendChild(o); }
sel.onchange = (e) => selectRoutine(e.target.value);

$('btn-fit').onclick = fitView;
$('btn-default-start').onclick = () => { start = defaultStart(routine); writeJSON(key('start', routine), start); syncStartInputs(); runSim(false); draw(); };
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

const MODEL_SLIDERS = [['sl-load', 'load_factor', v => v.toFixed(2)],
                       ['sl-tau', 'tau_s', v => v.toFixed(2) + ' s'],
                       ['sl-dead', 'v_dead', v => v.toFixed(2) + ' V']];
function syncModelSliders() {
  for (const [id, k, fmt] of MODEL_SLIDERS) { $(id).value = ROBOT.sim[k]; $(id + '-v').textContent = fmt(ROBOT.sim[k]); }
}
for (const [id, k, fmt] of MODEL_SLIDERS) {
  $(id).addEventListener('input', (e) => {
    ROBOT.sim[k] = parseFloat(e.target.value); $(id + '-v').textContent = fmt(ROBOT.sim[k]);
    writeJSON(key('model'), { load_factor: ROBOT.sim.load_factor, tau_s: ROBOT.sim.tau_s, v_dead: ROBOT.sim.v_dead });
    runSim(false); draw();
  });
}
syncModelSliders();
$('btn-reset-model').onclick = () => {
  Object.assign(ROBOT.sim, MODEL_DEFAULTS);
  writeJSON(key('model'), MODEL_DEFAULTS);
  syncModelSliders(); runSim(false); draw();
};

$('storage').textContent = storageWorks() ? 'kept across F5' : 'blocked by browser';
$('team-line').textContent = `Team ${TEAM} · Push Back 2025-26` +
  (BUILD ? ` · compiled ${BUILD.built.slice(5, 16)}` : '');
if (BUILD) $('team-line').title = `built from ${BUILD.project} at ${BUILD.built}`;

window.addEventListener('resize', resize);
setTheme('light');
const names = Object.keys(LOGS);
if (!names.length) {
  setStatus('no logs found — run build.bat first', false);
} else if (!applyLink()) {
  const last = readRaw(key('last'));
  routine = LOGS[last] ? last : names[0];
  sel.value = routine;
  selectRoutine(routine);
}
resize();
requestAnimationFrame(frame);
