/* =====================================================================
   THE RUNNERS PLAYGROUND — RACE PACER ENGINE
   One dashboard for every race in races.js. You normally don't need
   to edit this file. Combines the Kaapsehoop pacer (terrain model,
   quad load, cadence, reshape, ghost pacer, WhatsApp) and the Mataffin
   estimator (pace slider, wrist band, goals, live leaderboard), plus
   club/group filters on the leaderboard.
   ===================================================================== */
{
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const N = 220;

/* ---------- formatting ---------- */
const fmtPace = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad2(s % 60); };
const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? h + ':' + pad2(m) + ':' + pad2(x) : m + ':' + pad2(x); };
const fmtHMS = s => { s = Math.round(s); return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60); };
const fmtTod = s => { s = Math.round(s); return pad2(Math.floor(s / 3600) % 24) + ':' + pad2(Math.floor(s % 3600 / 60)); };
const parseT = raw => {
  if (raw == null) return null;
  const p = String(raw).trim().replace(/^'+/, '').split(':').map(Number);
  if (!p.length || p.some(n => isNaN(n) || n < 0)) return null;
  const t = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
  return t > 0 ? t : null;
};
const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); };
const store = { get(k) { try { return JSON.parse(localStorage.getItem('trp-pacer-' + k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('trp-pacer-' + k, JSON.stringify(v)); } catch (e) {} } };
const copy = async (text, okMsg) => { try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (e) { toast('Copy is blocked here. Select the text and copy it yourself.'); } };

/* ---------- physiology (from the Kaapsehoop pacer) ---------- */
const minettiCr = g => { const i = Math.max(-0.4, Math.min(0.4, g)); return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6; };
const gapFactor = pct => pct < 0 ? Math.max(0.78, Math.min(1.16, 1 - 0.033 * pct - 0.0022 * pct ** 2)) : Math.max(0.45, Math.pow(3.6 / minettiCr(pct / 100), 0.72));
/* heat: temperature + dew point (°F) rule */
const dewPoint = (t, rh) => { const a = 17.62, b = 243.12, g = Math.log(rh / 100) + a * t / (b + t); return b * g / (a - g); };
const HEAT = [[100, 0], [110, 0.5], [120, 1], [130, 2], [140, 3], [150, 4.5], [160, 6], [170, 8], [180, 10]];
const heatCost = (t, rh) => { const sum = (t * 9 / 5 + 32) + (dewPoint(t, rh) * 9 / 5 + 32); if (sum <= 100) return 0; for (let i = 1; i < HEAT.length; i++) if (sum <= HEAT[i][0]) { const [x0, y0] = HEAT[i - 1], [x1, y1] = HEAT[i]; return y0 + (y1 - y0) * (sum - x0) / (x1 - x0); } return Math.min(15, 10 + (sum - 180) * 0.2); };

const STRAT_HELP = {
  effort: 'Same effort all the way: slower up the hills, faster down them. Best for most runners.',
  flat: 'The same pace every km, like a metronome. Simple to follow, but hills will feel harder.',
  negative: 'Start a little easier and finish faster than you started. Great for a strong finish.',
  quadsaver: 'Hold back on the steep downhills to save your thigh muscles for the end.',
  bank: 'Run the early downhills hard to bank time. Risky: your legs may pay later.'
};
const SURF = { tar: { name: 'Tar', mult: 1, bg: '#fff' }, dirt: { name: 'Dirt', mult: 1.012, bg: '#FFF6D1' }, mixed: { name: 'Mixed', mult: 1.006, bg: '#E6FAF8' }, trail: { name: 'Trail', mult: 1.03, bg: '#FFE3EC' } };

/* ---------- state ---------- */
const RACES = window.RACES || [];
const S = { race: null, dist: null, watch: false, goal: 3300, strat: 'effort', mass: 70, cad: 176, bus: '', nodes: [], base: [], splits: [], hover: 0, sel: null, mode: 'inspect', down: false, ghost: null, wx: null,
  lb: { entries: [], dist: 'all', clubs: new Set(store.get('clubs') || []), rank: 'fastest', editing: null }, shareAll: false };

const km = () => S.watch && S.dist.watchKm ? S.dist.watchKm : S.dist.km;
const raceDate = () => S.race.date ? new Date(S.race.date + 'T00:00:00') : null;
const startSec = () => { const t = S.dist.start; if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 3600 + m * 60; };
const isDone = r => { if (r.finished) return true; if (!r.date) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(r.date + 'T00:00:00') < t; };
const lbUrl = r => { const u = (r.leaderboard || {}).url; return u === 'USE_DEFAULT' ? (window.LEADERBOARD_URL || '') : (u || ''); };

/* ---------- course ---------- */
const interp = (x, pts) => {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (x >= x0 && x <= x1) { const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0); return y0 + (1 - Math.cos(t * Math.PI)) / 2 * (y1 - y0); } }
  return pts[0][1];
};
const profile = () => S.dist.profile || [[0, 600], [S.dist.km, 600]];
const loadNodes = () => {
  const pts = profile(), end = pts[pts.length - 1][0] || 1;
  S.base = Array.from({ length: N }, (_, i) => interp(i / (N - 1) * end, pts));
  S.nodes = S.base.slice();
};
const landmarkFor = kmv => { const lm = (S.dist.landmarks || []).filter(l => Math.abs(l.km - kmv) <= 0.6).sort((a, b) => Math.abs(a.km - kmv) - Math.abs(b.km - kmv))[0]; return lm ? lm.label : null; };

/* ---------- the plan ---------- */
const compute = () => {
  const D = km(), target = Math.max(300, S.goal), avg = target / D, segsCfg = S.dist.segments || [];
  const segs = [];
  for (let a = 0; a < D - 1e-6;) {
    const b = Math.min(D, Math.floor(a + 1.0001)), len = +(b - a).toFixed(3);
    const i0 = Math.round(a / D * (N - 1)), i1 = Math.round(b / D * (N - 1));
    let gain = 0, loss = 0;
    for (let i = i0; i < i1; i++) { const d = S.nodes[i + 1] - S.nodes[i]; if (d > 0) gain += d; else loss -= d; }
    const grade = (S.nodes[i1] - S.nodes[i0]) / (len * 1000) * 100;
    segs.push({ a, b, len, i0, i1, gain, loss, grade, cfg: segsCfg[segs.length] || null });
    a = b;
  }
  let quad = 0, raw = 0;
  const brake = S.strat === 'quadsaver' ? 0.86 : S.strat === 'bank' ? 1.24 : 1;
  segs.forEach(s => {
    const p = s.b / D, g = s.grade, gf = gapFactor(g), surf = s.cfg && SURF[s.cfg.surface] ? SURF[s.cfg.surface].mult : 1;
    if (s.loss > 0) quad += S.mass * 9.81 * s.loss * 0.42 * brake * (g < -4.5 ? 1.35 : 1) / 1000;
    s.quad = quad;
    let m = surf / gf;
    if (S.strat === 'flat') m = 1;
    else if (S.strat === 'negative') m = m * (1 + 0.03 * (0.5 - (s.a + s.len / 2) / D));
    else if (S.strat === 'quadsaver') { if (g < -3 && p < 0.55) m *= 1.032; else if (p > 0.78) m *= 0.985; }
    else if (S.strat === 'bank' && g < -2 && p < 0.6) m *= 0.95;
    let fat = 0;
    if (S.strat !== 'flat' && p > 0.65) fat = Math.max(0, (quad - 140) / 280) * 8.5 * (g > 0.5 ? 2.4 : 0.7) * (S.strat === 'quadsaver' ? 0.55 : S.strat === 'bank' ? 1.65 : 1);
    s.fat = fat; s.raw = avg * m + fat; raw += s.raw * s.len;
  });
  const norm = target / raw, st = startSec();
  let el = 0, kcal = 0, gapSum = 0, G = 0, L = 0;
  S.splits = segs.map((s, idx) => {
    const pace = s.raw * norm; el += pace * s.len; G += s.gain; L += s.loss;
    gapSum += pace * gapFactor(s.grade) * s.len;
    kcal += minettiCr(s.grade / 100) * S.mass * s.len * 1000 / 4184;
    const spd = 1000 / pace;
    let cad = S.cad; if (s.grade < -2) cad += Math.min(8, Math.abs(s.grade) * 0.95) + (S.strat === 'quadsaver' ? 2 : 0); else if (s.grade > 1.5) cad += Math.min(6, s.grade * 0.8);
    const p = s.b / D;
    const rpe = s.cfg && s.cfg.rpe != null ? s.cfg.rpe : Math.max(4, Math.min(10, Math.round((5.2 + 3.8 * p + Math.max(0, s.grade) * 0.5 - Math.max(0, -s.grade) * 0.15) * 2) / 2));
    const label = Math.abs(s.b - Math.round(s.b)) < 0.01 ? String(Math.round(s.b)) : s.b.toFixed(1);
    const lmIn = (S.dist.landmarks || []).find(l => (l.km > s.a || (s.a === 0 && l.km === 0)) && l.km <= s.b + 0.001);
    const title = s.cfg && s.cfg.title ? s.cfg.title : (lmIn ? lmIn.label : 'Km ' + label);
    const cue = s.cfg && s.cfg.cue ? s.cfg.cue : autoCue(s.grade, p, idx, segs.length);
    const turn = S.dist.turnaround != null && S.dist.turnaround > s.a && S.dist.turnaround <= s.b + 0.001;
    return { ...s, idx, label, title, cue, turn, pace, diff: pace - avg, el, tod: st != null ? st + el : null, cadence: Math.round(cad), stride: (spd * 60 / cad).toFixed(2), rpe };
  });
  return { G, L, net: Math.round(S.nodes[N - 1] - S.nodes[0]), gap: gapSum / D, quad, kcal, avg, target };
};
const autoCue = (g, p, i, n) => {
  if (i === 0) return 'Start controlled. Let the crowd settle before you find your rhythm.';
  if (i === n - 1) return 'Last stretch: lift your knees, pump your arms and empty the tank!';
  if (g > 2.5) return 'Proper climb: shorten your stride, stay tall and keep the effort steady.';
  if (g > 0.8) return 'Gentle rise: keep the effort the same and let the pace drop a touch.';
  if (g < -2.5) return 'Downhill: quick light feet, lean slightly forward and let gravity work.';
  if (g < -0.8) return 'Slight drop: free speed. Relax your shoulders and roll.';
  if (p > 0.7) return 'Flat and late in the race: focus on form and pick off runners ahead.';
  return 'Flat section: settle into your goal pace and stay relaxed.';
};

/* ---------- render ---------- */
let R = null;
const render = () => {
  R = compute();
  const D = km();
  $('o-pace').textContent = fmtPace(R.avg);
  $('o-speed').textContent = (3600 / R.avg).toFixed(1) + ' km/h';
  $('o-tod').textContent = startSec() != null ? fmtTod(startSec() + R.target) : 'not set';
  const h = Math.floor(R.target / 3600), m = Math.floor(R.target % 3600 / 60), s = Math.round(R.target % 60);
  if (document.activeElement !== $('g-h')) $('g-h').value = h;
  if (document.activeElement !== $('g-m')) $('g-m').value = pad2(m);
  if (document.activeElement !== $('g-s')) $('g-s').value = pad2(s);
  const pr = Math.round(R.avg);
  if (document.activeElement !== $('p-m')) $('p-m').value = Math.floor(pr / 60);
  if (document.activeElement !== $('p-s')) $('p-s').value = pad2(pr % 60);
  $('p-slider').value = Math.min(900, Math.max(180, pr));
  $('mass-v').textContent = '· ' + S.mass + ' kg'; $('cad-v').textContent = '· ' + S.cad + ' steps/min';
  document.querySelectorAll('#strat-chips .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.strat === S.strat));
  $('strat-help').textContent = STRAT_HELP[S.strat];
  document.querySelectorAll('#goal-chips .chip').forEach(c => c.setAttribute('aria-pressed', parseT(c.dataset.t) === Math.round(R.target)));
  $('k-elev').textContent = '+' + Math.round(R.G) + ' / −' + Math.round(R.L) + ' m';
  $('k-net').textContent = 'climb / drop · net ' + (R.net > 0 ? '+' : '') + R.net + ' m';
  $('k-gap').textContent = fmtPace(R.gap) + ' /km';
  $('k-quad').textContent = Math.round(R.quad) + ' kJ';
  const last = S.splits[S.splits.length - 1];
  $('k-quad2').textContent = 'quad load · last km +' + Math.round(last ? last.fat : 0) + 's';
  $('k-cal').textContent = Math.round(R.kcal).toLocaleString() + ' kcal';
  renderHeat();
  $('sp-chip').textContent = D.toFixed(1) + ' km · ' + fmtDur(R.target);
  $('sp-body').innerHTML = S.splits.map(sp => {
    const gc = sp.grade >= 1.5 ? 'up' : sp.grade <= -1.5 ? 'down' : '';
    const sf = sp.cfg && SURF[sp.cfg.surface] ? `<span class="surf" style="background:${SURF[sp.cfg.surface].bg}">${SURF[sp.cfg.surface].name}</span>` : '';
    const d = Math.round(sp.diff);
    return `<tr data-i="${sp.idx}" class="${sp.idx === S.sel ? 'sel' : ''} ${sp.turn ? 'turn' : ''}"><td><b>${esc(sp.label)}</b></td><td>${sf}<b>${esc(sp.title)}</b>${sp.turn ? ' <span class="badge slow">turnaround</span>' : ''}<span class="cue">${esc(sp.cue)}</span></td><td class="${gc}">${sp.grade > 0 ? '+' : ''}${sp.grade.toFixed(1)}%</td><td><b>${fmtPace(sp.pace)}</b></td><td class="hide-sm ${d < 0 ? 'down' : d > 0 ? 'up' : ''}">${d === 0 ? 'even' : (d > 0 ? '+' : '') + d + 's'}</td><td>${fmtDur(sp.el)}</td><td class="hide-sm">${sp.tod != null ? fmtTod(sp.tod) : '–'}</td><td class="hide-sm">${sp.rpe}/10<span class="rpe"><i style="width:${sp.rpe * 10}%"></i></span></td><td class="hide-sm">${sp.cadence}</td><td class="hide-sm">${Math.round(sp.quad)} kJ</td></tr>`;
  }).join('');
  $('f-summary').textContent = S.dist.label + ' · goal ' + fmtDur(R.target) + ' (' + fmtPace(R.avg) + '/km)';
  tele(S.hover); draw(); saveLocal();
};
const renderHeat = () => {
  if (!S.wx) { $('k-heat').textContent = '–'; $('k-heat2').textContent = S.race.coords ? 'race-morning weather · forecast appears about 2 weeks out' : 'race-morning weather'; return; }
  const st = startSec() || 6 * 3600, t0 = wxAt(st), t1 = wxAt(st + R.target);
  const cost = (heatCost(t0.t, t0.rh) + heatCost(t1.t, t1.rh)) / 2;
  $('k-heat').textContent = Math.round(t0.t) + '→' + Math.round(t1.t) + ' °C';
  $('k-heat2').textContent = Math.round(t0.rh) + '% humidity · heat may cost about +' + cost.toFixed(1) + '% (≈ +' + fmtDur(R.target * cost / 100) + ')';
};
const wxAt = sec => { const h = sec / 3600, i = Math.max(0, Math.min(22, Math.floor(h))), f = h - i; const T = S.wx.t, H = S.wx.rh; return { t: T[i] + (T[i + 1] - T[i]) * f, rh: H[i] + (H[i + 1] - H[i]) * f }; };

/* ---------- canvas ---------- */
const cv = $('cv'), ctx = cv.getContext('2d'), box = $('chart'), PADC = { t: 26, r: 14, b: 28, l: 46 };
const draw = () => {
  const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const D = km(), pw = w - PADC.l - PADC.r, ph = h - PADC.t - PADC.b;
  let lo = Math.min(...S.nodes), hi = Math.max(...S.nodes); const span = Math.max(30, hi - lo); lo -= span * 0.15; hi += span * 0.2;
  const X = i => PADC.l + i / (N - 1) * pw, Y = e => PADC.t + ph - (e - lo) / (hi - lo) * ph;
  ctx.font = "700 11px Nunito, sans-serif"; ctx.fillStyle = '#3D4F63'; ctx.strokeStyle = '#CFE3F2'; ctx.lineWidth = 1;
  const stepE = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(s => (hi - lo) / s <= 5) || 500;
  for (let e = Math.ceil(lo / stepE) * stepE; e < hi; e += stepE) { const y = Y(e); ctx.beginPath(); ctx.moveTo(PADC.l, y); ctx.lineTo(w - PADC.r, y); ctx.stroke(); ctx.fillText(e + 'm', 4, y + 4); }
  const stepK = D > 25 ? 5 : D > 12 ? 2 : 1;
  ctx.textAlign = 'center';
  for (let k = 0; k <= D + 1e-6; k += stepK) ctx.fillText(k + (k === 0 ? ' km' : ''), X(k / D * (N - 1)), h - 9);
  ctx.textAlign = 'left';
  if (S.sel != null && S.splits[S.sel]) { const sp = S.splits[S.sel]; ctx.fillStyle = 'rgba(255,210,63,.35)'; ctx.fillRect(X(sp.i0), PADC.t, X(sp.i1) - X(sp.i0), ph); }
  const grad = ctx.createLinearGradient(0, PADC.t, 0, PADC.t + ph); grad.addColorStop(0, 'rgba(46,196,182,.35)'); grad.addColorStop(1, 'rgba(46,196,182,.03)');
  ctx.beginPath(); ctx.moveTo(X(0), PADC.t + ph); for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(S.nodes[i])); ctx.lineTo(X(N - 1), PADC.t + ph); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  const segM = D * 1000 / (N - 1);
  ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  for (let i = 0; i < N - 1; i++) { const g = (S.nodes[i + 1] - S.nodes[i]) / segM * 100; ctx.strokeStyle = g < -1.5 ? '#0B9488' : g > 1.5 ? '#FF5C8A' : '#0F2236'; ctx.beginPath(); ctx.moveTo(X(i), Y(S.nodes[i])); ctx.lineTo(X(i + 1), Y(S.nodes[i + 1])); ctx.stroke(); }
  if (S.dist.turnaround != null) { const tx = X(S.dist.turnaround / D * (N - 1)); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#0F2236'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx, PADC.t); ctx.lineTo(tx, PADC.t + ph); ctx.stroke(); ctx.setLineDash([]); label(tx, PADC.t - 6, 'TURNAROUND', w); }
  const hx = X(S.hover), hy = Y(S.nodes[S.hover]);
  ctx.strokeStyle = 'rgba(15,34,54,.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, PADC.t); ctx.lineTo(hx, PADC.t + ph); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fillStyle = '#FFD23F'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#0F2236'; ctx.stroke();
};
const label = (x, y, text, w) => { ctx.font = "800 10px Nunito, sans-serif"; const tw = ctx.measureText(text).width + 12; const lx = Math.max(PADC.l, Math.min(w - PADC.r - tw, x - tw / 2)); ctx.fillStyle = '#0F2236'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, y - 13, tw, 17, 6) : ctx.rect(lx, y - 13, tw, 17); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(text, lx + 6, y - 1); };
const tele = i => {
  S.hover = i; $('scrub').value = i;
  const D = km(), at = i / (N - 1) * D, sp = S.splits[Math.min(S.splits.length - 1, Math.floor(at))]; if (!sp) return;
  $('t-km').textContent = 'km ' + at.toFixed(1) + ' · ' + Math.round(S.nodes[i]) + ' m';
  $('t-grade').textContent = (sp.grade > 0 ? '+' : '') + sp.grade.toFixed(1) + '%';
  $('t-pace').textContent = fmtPace(sp.pace) + ' /km';
  $('t-bio').textContent = sp.cadence + ' · ' + sp.stride + ' m';
  if (S.wx) { const tsec = (startSec() || 6 * 3600) + sp.el - sp.pace * (sp.b - at); const w = wxAt(tsec); $('t-wx').textContent = Math.round(w.t) + ' °C · ' + Math.round(w.rh) + '%'; } else $('t-wx').textContent = '–';
  $('banner').innerHTML = `<span class="pill ink">KM ${esc(sp.label)}</span> <h3 style="display:inline">${esc(sp.title)}</h3><p style="margin:8px 0 6px">${esc(sp.cue)}</p><div class="row" style="font-weight:800"><span class="pill">${fmtPace(sp.pace)}/km</span><span class="pill">at ${fmtDur(sp.el)}</span><span class="pill">${sp.grade > 0 ? '+' : ''}${sp.grade.toFixed(1)}% · ${Math.round(sp.gain)}m up ${Math.round(sp.loss)}m down</span><span class="pill pk">effort ${sp.rpe}/10</span></div>`;
};
const pointer = e => {
  const r = cv.getBoundingClientRect(), pt = e.touches ? e.touches[0] : e, pw = r.width - PADC.l - PADC.r, ph = r.height - PADC.t - PADC.b;
  const rx = Math.max(0, Math.min(pw, pt.clientX - r.left - PADC.l)), ry = Math.max(0, Math.min(ph, pt.clientY - r.top - PADC.t));
  const i = Math.round(rx / pw * (N - 1));
  if (S.down && S.mode === 'sculpt') {
    let lo = Math.min(...S.nodes), hi = Math.max(...S.nodes); const span = Math.max(30, hi - lo); lo -= span * 0.15; hi += span * 0.2;
    const target = hi - ry / ph * (hi - lo), brush = 12;
    for (let j = Math.max(0, i - brush); j <= Math.min(N - 1, i + brush); j++) { const wgt = Math.cos(Math.abs(j - i) / brush * Math.PI / 2) * 0.35; S.nodes[j] = S.nodes[j] * (1 - wgt) + target * wgt; }
    S.hover = i; render();
  } else { tele(i); draw(); }
};
cv.addEventListener('mousedown', e => { S.down = true; pointer(e); });
cv.addEventListener('mousemove', e => { if (S.down || S.mode === 'inspect') pointer(e); });
window.addEventListener('mouseup', () => { S.down = false; });
cv.addEventListener('touchstart', e => { S.down = true; pointer(e); }, { passive: true });
cv.addEventListener('touchmove', e => { if (S.mode === 'sculpt') e.preventDefault(); pointer(e); }, { passive: false });
cv.addEventListener('touchend', () => { S.down = false; });
$('scrub').addEventListener('input', e => { tele(+e.target.value); draw(); });
const setMode = m => { S.mode = m; $('m-inspect').setAttribute('aria-pressed', m === 'inspect'); $('m-sculpt').setAttribute('aria-pressed', m === 'sculpt'); box.classList.toggle('sculpt', m === 'sculpt'); if (m === 'sculpt') toast('Drag on the chart to reshape the course. Tap Reset to undo.'); };
$('m-inspect').addEventListener('click', () => setMode('inspect'));
$('m-sculpt').addEventListener('click', () => setMode('sculpt'));
$('b-reset').addEventListener('click', () => { S.nodes = S.base.slice(); render(); toast('Course reset.'); });
$('b-ghost').addEventListener('click', () => {
  if (S.ghost) { cancelAnimationFrame(S.ghost); S.ghost = null; $('b-ghost').textContent = 'Ghost pacer'; return; }
  $('b-ghost').textContent = 'Stop pacer';
  let p = S.hover / (N - 1);
  const step = () => { p = (p + 0.0025) % 1; tele(Math.floor(p * (N - 1))); draw(); S.ghost = requestAnimationFrame(step); };
  S.ghost = requestAnimationFrame(step);
});
new ResizeObserver(draw).observe(box);

/* ---------- inputs ---------- */
const setGoal = sec => { S.goal = Math.max(300, Math.min(30 * 3600, Math.round(sec))); render(); };
const readHMS = () => setGoal((+$('g-h').value || 0) * 3600 + (+$('g-m').value || 0) * 60 + (+$('g-s').value || 0));
['g-h', 'g-m', 'g-s'].forEach(id => $(id).addEventListener('change', readHMS));
document.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { const f = { h: 3600, m: 60, s: 1 }[b.dataset.st]; setGoal(S.goal + f * +b.dataset.d); }));
const readPace = () => setGoal(((+$('p-m').value || 0) * 60 + (+$('p-s').value || 0)) * km());
['p-m', 'p-s'].forEach(id => $(id).addEventListener('change', readPace));
$('p-slider').addEventListener('input', e => setGoal(+e.target.value * km()));
document.querySelectorAll('[data-nudge]').forEach(b => b.addEventListener('click', () => setGoal((Math.round(S.goal / km()) + +b.dataset.nudge) * km())));
$('goal-chips').addEventListener('click', e => { const c = e.target.closest('[data-t]'); if (c) setGoal(parseT(c.dataset.t)); });
$('strat-chips').addEventListener('click', e => { const c = e.target.closest('[data-strat]'); if (c) { S.strat = c.dataset.strat; render(); } });
$('mass').addEventListener('input', e => { S.mass = +e.target.value; render(); });
$('cad').addEventListener('input', e => { S.cad = +e.target.value; render(); });
$('bus').addEventListener('input', e => { S.bus = e.target.value; saveLocal(); });
$('sp-body').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-i]'); if (!tr) return;
  const sp = S.splits[+tr.dataset.i]; S.sel = sp.idx; S.hover = Math.round((sp.i0 + sp.i1) / 2); render();
  if (window.innerWidth <= 980) showTab('p-course');
});

/* ---------- race & distance ---------- */
const fmtDate = d => d ? d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const setupRace = (id, distKey) => {
  S.race = RACES.find(r => r.id === id) || RACES[0];
  S.dist = S.race.distances.find(d => d.key === distKey) || S.race.distances[0];
  $('race-sel').value = S.race.id;
  document.title = S.race.name + ' · Race Pacer';
  $('r-name').textContent = S.race.name;
  const d = raceDate(), today = new Date(); today.setHours(0, 0, 0, 0);
  const days = d ? Math.round((d - today) / 864e5) : null;
  const done = isDone(S.race);
  $('r-status').textContent = done ? 'Past race · see the results' : days === 0 ? 'Race day! Good luck' : days != null ? days + (days === 1 ? ' day to go' : ' days to go') : 'Race pacer';
  $('r-status').className = 'pill ' + (done ? 'pk' : 'ye');
  $('r-meta').innerHTML = [d ? esc(fmtDate(d)) : '', esc(S.race.venue || ''), S.race.entryUrl ? `<a href="${esc(S.race.entryUrl)}" target="_blank" rel="noopener">Race entries</a>` : '']
    .filter(Boolean).map(x => `<span class="pill">${x}</span>`).join('');
  $('dist-seg').innerHTML = S.race.distances.map(x => `<button type="button" data-dist="${esc(x.key)}" aria-pressed="${x.key === S.dist.key}">${esc(x.label)}${x.start ? ' · ' + esc(x.start) : ''}</button>`).join('');
  setupDistance();
  loadWeather(); setupBoard(); showPred();
};
const setupDistance = () => {
  if (!S.dist.watchKm) S.watch = false;
  $('pr-race').textContent = (S.race.name || 'this race') + ' (' + S.dist.label + ')';
  $('watch-seg').hidden = !S.dist.watchKm;
  if (S.dist.watchKm) $('watch-seg').innerHTML = `<button type="button" data-w="0" aria-pressed="${!S.watch}">Official ${S.dist.km} km</button><button type="button" data-w="1" aria-pressed="${S.watch}">My watch says ${S.dist.watchKm.toFixed(1)} km</button>`;
  document.querySelectorAll('#dist-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.dist === S.dist.key));
  $('goal-chips').innerHTML = (S.dist.goals || []).map(t => `<button type="button" class="chip tq" data-t="${esc(t)}">${esc(fmtDur(parseT(t)))}</button>`).join('');
  const notes = [];
  if (S.race.note) notes.push(S.race.note);
  if (S.dist.estimated) notes.push('Heads up: the hills for this course are not mapped yet, so the profile is drawn flat and the landmark distances are approximate.');
  $('r-notice').hidden = !notes.length; $('r-notice').firstElementChild.textContent = notes.join(' ');
  S.sel = null; S.hover = 0;
  loadNodes();
  render();
};
$('race-sel').addEventListener('change', e => { const r = RACES.find(x => x.id === e.target.value); S.goal = parseT(r.distances[0].goal) || 3600; setupRace(r.id); history.replaceState(null, '', '?race=' + r.id); });
$('dist-seg').addEventListener('click', e => { const b = e.target.closest('[data-dist]'); if (!b) return; S.dist = S.race.distances.find(x => x.key === b.dataset.dist); S.goal = parseT(S.dist.goal) || S.goal; setupDistance(); setupBoardForm(); });
$('watch-seg').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; const pace = S.goal / km(); S.watch = b.dataset.w === '1'; S.goal = pace * km(); setupDistance(); });

/* ---------- weather forecast (Open-Meteo, free) ---------- */
const loadWeather = async () => {
  S.wx = null; renderHeat();
  const d = raceDate(); if (!d || !S.race.coords) return;
  const days = (d - Date.now()) / 864e5; if (days > 15 || days < -60) return;
  const ds = S.race.date, raceId = S.race.id;
  try {
    const host = days < -1 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    const r = await fetch(`${host}?latitude=${S.race.coords[0]}&longitude=${S.race.coords[1]}&hourly=temperature_2m,relative_humidity_2m&timezone=Africa%2FJohannesburg&start_date=${ds}&end_date=${ds}`);
    const j = await r.json();
    if (S.race.id !== raceId || !j.hourly) return;
    S.wx = { t: j.hourly.temperature_2m, rh: j.hourly.relative_humidity_2m };
    if (S.wx.t.some(v => v == null)) S.wx = null;
    render();
  } catch (e) { /* forecast is a bonus; ignore */ }
};

/* ---------- tabs (phones) ---------- */
const showTab = (id, scroll = true) => {
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
  document.querySelectorAll('.panel').forEach(p => p.dataset.hide = p.id !== id);
  if (scroll) window.scrollTo({ top: document.querySelector('.tabs').offsetTop, behavior: 'smooth' });
  if (id === 'p-course') requestAnimationFrame(draw);
};
document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
showTab('p-plan', false);

/* ---------- sharing ---------- */
const shareUrl = () => { const u = new URL(location.href.split('?')[0]); const p = new URLSearchParams({ race: S.race.id, d: S.dist.key, t: fmtHMS(S.goal), s: S.strat, w: S.watch ? 1 : 0, kg: S.mass, cad: S.cad }); if (S.bus.trim()) p.set('bus', S.bus.trim()); return u + '?' + p; };
const keyIdx = () => { const n = S.splits.length; const want = new Set([0, n - 1]); (S.dist.landmarks || []).forEach(l => want.add(Math.min(n - 1, Math.max(0, Math.ceil(l.km - 0.001) - 1)))); if (want.size < 4) [0.25, 0.5, 0.75].forEach(f => want.add(Math.round(f * (n - 1)))); return [...want].sort((a, b) => a - b); };
const message = all => {
  const lines = [`🏃 *${S.race.name.toUpperCase()} · PACE PLAN*`, `🏷️ ${S.bus.trim() || 'My race plan'} · ${S.dist.label}`, `⏱️ Goal ${fmtDur(R.target)} (${fmtPace(R.avg)}/km)${startSec() != null ? ' · finish about ' + fmtTod(startSec() + R.target) : ''}`, `📈 Course +${Math.round(R.G)} m / −${Math.round(R.L)} m · ${STRAT_HELP[S.strat].split('.')[0]}`, ''];
  lines.push(all ? '📊 *EVERY KM*' : '📍 *KEY POINTS*');
  (all ? S.splits : keyIdx().map(i => S.splits[i])).forEach(sp => lines.push(`• km ${sp.label}${all ? '' : ' (' + sp.title + ')'}: ${fmtPace(sp.pace)}/km → ${fmtDur(sp.el)}`));
  lines.push('', '🔗 Open my plan: ' + shareUrl());
  return lines.join('\n');
};
const openModal = id => { $(id).classList.add('open'); const f = $(id).querySelector('button,a,input,textarea'); if (f) f.focus(); };
document.querySelectorAll('.modal').forEach(m => { m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('open'); }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); });
const fillShare = () => { const t = message(S.shareAll); $('sh-text').value = t; $('sh-wa').href = 'https://wa.me/?text=' + encodeURIComponent(t); $('sh-key').setAttribute('aria-pressed', !S.shareAll); $('sh-all').setAttribute('aria-pressed', S.shareAll); };
$('b-share').addEventListener('click', () => { fillShare(); openModal('mo-share'); });
$('sh-key').addEventListener('click', () => { S.shareAll = false; fillShare(); });
$('sh-all').addEventListener('click', () => { S.shareAll = true; fillShare(); });
$('sh-text').addEventListener('input', () => { $('sh-wa').href = 'https://wa.me/?text=' + encodeURIComponent($('sh-text').value); });
$('sh-copy').addEventListener('click', () => copy($('sh-text').value, 'Copied! Paste it in WhatsApp.'));
$('b-copy').addEventListener('click', () => copy(message(true), 'Plan copied!'));
$('b-link').addEventListener('click', () => copy(shareUrl(), 'Link copied!'));
$('b-band').addEventListener('click', () => {
  $('band-head').textContent = S.race.name + ' · ' + S.dist.label;
  $('band-sub').textContent = 'Goal ' + fmtDur(R.target) + ' · ' + fmtPace(R.avg) + '/km · ' + $('strat-chips').querySelector('[aria-pressed=true]').textContent;
  $('band-body').innerHTML = S.splits.map(sp => `<tr><td>km ${esc(sp.label)}</td><td>${fmtPace(sp.pace)}</td><td>${fmtDur(sp.el)}</td></tr>`).join('');
  openModal('mo-band');
});
$('band-print-btn').addEventListener('click', () => { try { window.print(); } catch (e) { toast('Printing is blocked here. Try on the live site.'); } });

/* ---------- leaderboard ---------- */
const distOfEntry = e => {
  const s = String(e.distance || '').toLowerCase(), list = S.race.distances;
  return list.find(d => s === d.label.toLowerCase() || s === d.key.toLowerCase()) || list.find(d => s.includes(String(d.km))) || list.find(d => d.watchKm && s.includes(String(d.watchKm))) || list.find(d => s.includes(String(Math.round(d.km)))) || null;
};
const setupBoard = () => {
  const url = lbUrl(S.race);
  $('lb-on').hidden = !url; $('lb-off').hidden = !!url;
  document.querySelector('.lb').hidden = !url;
  if (!url) { $('lb-off-msg').textContent = S.race.leaderboard && S.race.leaderboard.url === 'USE_DEFAULT' ? 'The leaderboard for this race opens as soon as your Google Sheet is connected (see SETUP.txt). Your plan above already works.' : 'There is no leaderboard for this race.'; return; }
  setupBoardForm();
  $('lb-dist').innerHTML = [['all', 'All']].concat(S.race.distances.map(d => [d.key, d.label])).map(([k, l]) => `<button type="button" class="chip" data-ld="${esc(k)}" aria-pressed="${S.lb.dist === k}">${esc(l)}</button>`).join('');
  S.lb.entries = []; S.lb.loaded = false; renderBoard(); loadBoard();
};
const setupBoardForm = () => {
  $('f-done').hidden = true; const c = store.get('myclub'); if (c && !$('f-club').value) $('f-club').value = c;
  const done = isDone(S.race);
  $('lb-title').textContent = done ? 'Ran this race? Add your result' : 'Lock in your goal & join the leaderboard';
  $('f-actual').hidden = !done; $('f-cal').hidden = done;
  $('f-go').textContent = done ? 'Add my result' : 'Add my goal';
};
const loadBoard = async () => {
  const url = lbUrl(S.race); if (!url) return;
  $('lb-refresh').textContent = 'Loading…';
  try {
    const legacy = (S.race.leaderboard || {}).legacy;
    const res = await fetch(legacy ? url : url + (url.includes('?') ? '&' : '?') + 'race=' + encodeURIComponent(S.race.id));
    const data = await res.json();
    let list = Array.isArray(data) ? data : (data.entries || []);
    if (!legacy) list = list.filter(e => !e.race || e.race === S.race.id);
    S.lb.entries = list; S.lb.loaded = true; renderBoard();
  } catch (e) { $('lb-body').innerHTML = '<tr><td colspan="6">Could not load the leaderboard. Check your connection and tap Refresh.</td></tr>'; }
  finally { $('lb-refresh').textContent = 'Refresh'; }
};
const boardEntries = () => S.lb.entries.length ? S.lb.entries : (S.lb.loaded && isDone(S.race) ? (S.race.examples || []).map((e, i) => ({ ...e, id: 'ex' + i, example: true })) : []);
const renderBoard = () => {
  const all = boardEntries();
  $('lb-example').hidden = !all.some(e => e.example);
  const clubs = [...new Set(all.map(e => String(e.club || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('club-list').innerHTML = clubs.map(c => `<option value="${esc(c)}">`).join('');
  [...S.lb.clubs].forEach(c => { if (!clubs.includes(c) && all.length) S.lb.clubs.delete(c); });
  $('lb-clubs').innerHTML = `<button type="button" class="chip tq" data-lc="" aria-pressed="${S.lb.clubs.size === 0}">All runners</button>` + clubs.map(c => `<button type="button" class="chip tq" data-lc="${esc(c)}" aria-pressed="${S.lb.clubs.has(c)}">${esc(c)}</button>`).join('') + (clubs.length ? '' : '<span class="muted">Clubs appear here once runners add them.</span>');
  document.querySelectorAll('#lb-dist .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.ld === S.lb.dist));
  $('r-fast').setAttribute('aria-pressed', S.lb.rank === 'fastest'); $('r-pace').setAttribute('aria-pressed', S.lb.rank === 'pacing');
  $('lb-note').textContent = S.lb.rank === 'pacing' ? 'Pacing champion: closest to their own goal wins. Beating your goal wins a tie.' : S.lb.dist === 'all' ? 'Fastest: ranked by average pace, so different distances compare fairly.' : 'Fastest: ranked by finish time.';
  const rows = all.map(e => {
    const d = distOfEntry(e), dk = d ? d.km : parseFloat(e.distance) || null;
    const g = parseT(e.goalTime), a = parseT(e.actualTime);
    return { e, d, dk, g, a, ap: a && dk ? a / dk : null, gp: g && dk ? g / dk : null, diff: a && g ? a - g : null, club: String(e.club || '').trim() };
  }).filter(r => (S.lb.dist === 'all' || (r.d && r.d.key === S.lb.dist)) && (S.lb.clubs.size === 0 || S.lb.clubs.has(r.club)));
  const fin = rows.filter(r => r.a), pend = rows.filter(r => !r.a);
  if (S.lb.rank === 'fastest') fin.sort((x, y) => S.lb.dist === 'all' ? x.ap - y.ap : x.a - y.a);
  else fin.sort((x, y) => (Math.abs(x.diff ?? 1e9) - Math.abs(y.diff ?? 1e9)) || ((x.diff ?? 1e9) - (y.diff ?? 1e9)));
  if (!rows.length) { $('lb-body').innerHTML = `<tr><td colspan="6">${all.length ? 'Nobody matches these filters yet.' : isDone(S.race) ? 'No results yet. Ran it? Add yours!' : 'No goals yet. Be the first to lock yours in!'}</td></tr>`; return; }
  const who = r => `<b>${esc(r.e.name || 'Runner')}</b>${r.e.example ? ' <span class="badge slow">Example</span>' : ''}${r.club ? `<br><span class="club">${esc(r.club)}</span>` : ''}`;
  const medal = i => i < 3 ? `<span class="medal" style="background:${['#FFD23F', '#E4EEF6', '#FFC2D4'][i]}">${i + 1}</span>` : '#' + (i + 1);
  let html = fin.map((r, i) => {
    const vs = r.diff == null ? '–' : `<span class="badge ${r.diff <= 0 ? 'good' : 'slow'}">${r.diff <= 0 ? '−' : '+'}${fmtDur(Math.abs(r.diff))}</span>`;
    return `<tr><td>${medal(i)}</td><td>${who(r)}</td><td>${esc(r.d ? r.d.label : r.e.distance)}</td><td>${r.g ? fmtDur(r.g) : '–'}<br><span class="muted">${r.gp ? fmtPace(r.gp) + '/km' : ''}</span></td><td><b>${fmtDur(r.a)}</b><br><span class="muted">${r.ap ? fmtPace(r.ap) + '/km' : ''}</span></td><td>${vs}</td></tr>`;
  }).join('');
  if (fin.length && pend.length) html += `<tr><td colspan="6" class="muted" style="text-align:left;font-weight:900">Still to log their time (${pend.length})</td></tr>`;
  html += pend.map(r => `<tr><td>–</td><td>${who(r)}</td><td>${esc(r.d ? r.d.label : r.e.distance)}</td><td>${r.g ? fmtDur(r.g) : '–'}<br><span class="muted">${r.gp ? fmtPace(r.gp) + '/km' : ''}</span></td><td>${r.e.example ? '–' : `<button type="button" class="btn sm pk" data-log="${esc(r.e.id)}">Log time</button>`}</td><td class="muted">pending</td></tr>`).join('');
  $('lb-body').innerHTML = html;
};
$('lb-dist').addEventListener('click', e => { const c = e.target.closest('[data-ld]'); if (c) { S.lb.dist = c.dataset.ld; renderBoard(); } });
$('lb-clubs').addEventListener('click', e => {
  const c = e.target.closest('[data-lc]'); if (!c) return;
  if (!c.dataset.lc) S.lb.clubs.clear(); else S.lb.clubs.has(c.dataset.lc) ? S.lb.clubs.delete(c.dataset.lc) : S.lb.clubs.add(c.dataset.lc);
  store.set('clubs', [...S.lb.clubs]); renderBoard();
});
$('r-fast').addEventListener('click', () => { S.lb.rank = 'fastest'; renderBoard(); });
$('r-pace').addEventListener('click', () => { S.lb.rank = 'pacing'; renderBoard(); });
$('lb-refresh').addEventListener('click', loadBoard);
const post = body => fetch(lbUrl(S.race), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
$('goal-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('f-name').value.trim(), club = $('f-club').value.trim();
  if (!name) { toast('Please add your name.'); return; }
  const done = isDone(S.race);
  const actual = (+$('fa-h').value || 0) * 3600 + (+$('fa-m').value || 0) * 60 + (+$('fa-s').value || 0);
  if (done && actual <= 0) { toast('Please add your actual finish time.'); return; }
  $('f-go').disabled = true; $('f-go').textContent = 'Saving…';
  try {
    const id = String(Date.now());
    await post({ action: 'add_goal', race: S.race.id, id, name, club, distance: S.dist.label, goalTime: fmtHMS(S.goal) });
    if (done) await post({ action: 'log_actual', race: S.race.id, id, actualTime: fmtHMS(actual) });
    if (club) store.set('myclub', club);
    $('f-done-msg').textContent = done ? `${name}'s result is on the leaderboard: ${fmtDur(actual)} for ${S.dist.label} (goal ${fmtDur(S.goal)}). Well run!` : `${name} is locked in for ${S.dist.label} at ${fmtDur(S.goal)}! Set a reminder to log your real time after the race.`;
    $('f-gcal').href = gcalUrl(); $('f-done').hidden = false; $('f-name').value = '';
    toast('Goal added to the leaderboard!'); await loadBoard();
  } catch (err) { toast('Could not save. Check your connection and try again.'); }
  finally { $('f-go').disabled = false; $('f-go').textContent = isDone(S.race) ? 'Add my result' : 'Add my goal'; }
});
const reminderUTC = () => { const [h, m] = (S.race.logReminder || '13:00').split(':').map(Number); const d = raceDate() || new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 2, m)); };
const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const gcalUrl = () => { const a = reminderUTC(), b = new Date(a.getTime() + 30 * 60000); return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Log my ' + S.race.name + ' time') + '&dates=' + icsStamp(a) + '/' + icsStamp(b) + '&details=' + encodeURIComponent('Log your actual finish time on the leaderboard: ' + location.href.split('#')[0]) + '&location=' + encodeURIComponent(S.race.venue || ''); };
$('f-ics').addEventListener('click', () => {
  const a = reminderUTC(), b = new Date(a.getTime() + 30 * 60000);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Runners Playground//Race Pacer//EN', 'BEGIN:VEVENT', 'UID:' + S.race.id + '-' + Date.now() + '@runnersplayground', 'DTSTAMP:' + icsStamp(new Date()), 'DTSTART:' + icsStamp(a), 'DTEND:' + icsStamp(b), 'SUMMARY:Log my ' + S.race.name + ' time', 'DESCRIPTION:Log your actual finish time: ' + location.href.split('#')[0], 'LOCATION:' + (S.race.venue || ''), 'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Log your race time', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), link = document.createElement('a');
  link.href = url; link.download = S.race.id + '-reminder.ics'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('lb-body').addEventListener('click', e => {
  const b = e.target.closest('[data-log]'); if (!b) return;
  const en = S.lb.entries.find(x => String(x.id) === b.dataset.log); if (!en) return;
  S.lb.editing = en.id; const g = parseT(en.goalTime) || 3600;
  $('a-who').textContent = en.name + ' · ' + en.distance + ' · goal ' + fmtDur(g);
  $('a-h').value = Math.floor(g / 3600); $('a-m').value = pad2(Math.floor(g % 3600 / 60)); $('a-s').value = pad2(g % 60);
  openModal('mo-actual');
});
$('a-save').addEventListener('click', async () => {
  const t = (+$('a-h').value || 0) * 3600 + (+$('a-m').value || 0) * 60 + (+$('a-s').value || 0);
  if (t <= 0) { toast('Enter your finish time.'); return; }
  $('a-save').disabled = true; $('a-save').textContent = 'Saving…';
  try { await post({ action: 'log_actual', race: S.race.id, id: S.lb.editing, actualTime: fmtHMS(t) }); $('mo-actual').classList.remove('open'); toast('Time logged. Well run!'); await loadBoard(); }
  catch (e) { toast('Could not save. Try again.'); }
  finally { $('a-save').disabled = false; $('a-save').textContent = 'Save my time'; }
});

/* ---------- route requests ---------- */
$('req-form').addEventListener('submit', async e => {
  e.preventDefault();
  const url = window.LEADERBOARD_URL, msg = $('q-msg');
  if (!url) { msg.textContent = 'Requests open as soon as the Google Sheet is connected. Please try again soon.'; return; }
  const f = $('q-gpx').files[0];
  if (f && f.size > 2 * 1024 * 1024) { msg.textContent = 'That file is over 2 MB. Please send a smaller GPX.'; return; }
  const mail = $('q-mail').value.trim();
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { msg.textContent = 'Please check the email address, or leave it empty.'; return; }
  $('q-go').disabled = true; $('q-go').textContent = 'Sending…'; msg.textContent = '';
  try {
    const gpx = f ? await f.text() : '';
    if (gpx && !/<gpx[\s>]/i.test(gpx)) throw new Error('That file does not look like a GPX route.');
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'route_request', race: $('q-race').value.trim(), date: $('q-date').value, distances: $('q-dist').value.trim(), place: $('q-place').value.trim(), name: $('q-name').value.trim(), email: mail, note: $('q-note').value.trim(), gpxName: f ? f.name : '', gpx }) });
    $('req-form').reset(); msg.textContent = 'Thank you! Your request is in. Watch this page for your race.'; toast('Route request sent!');
  } catch (err) { msg.textContent = (err.message && err.message.startsWith('That file') ? err.message : 'Could not send. Check your connection and try again.'); }
  finally { $('q-go').disabled = false; $('q-go').textContent = 'Send request'; }
});


/* ---------- personal race prediction ----------
   Runner enters recent runs: distance, time, effort, optional climb.
   1. Each run becomes a flat-road race effort (climb removed, easy runs scaled up to race effort).
   2. Riegel's formula stretches it to this race's distance: T2 = T1 × (D2 / D1)^1.06
   3. Runs are blended: races & hard runs and runs close to the race distance count most.
   4. This course's hills (the pacer's own terrain model) and the race-morning heat forecast are added. */
const EFFORT = { race: { f: 1, w: 4, name: 'Race / time trial' }, hard: { f: 0.975, w: 3, name: 'Hard' }, steady: { f: 0.93, w: 2, name: 'Steady' }, easy: { f: 0.87, w: 1, name: 'Easy' } };
const P = { runs: store.get('runs') || [{}, {}, {}], on: false, res: null };
const readTime = raw => { const v = String(raw || '').trim().replace(/[hms ]+/g, ':').replace(/:+$/, ''); if (/^\d+(\.\d+)?$/.test(v)) return +v * 60; return parseT(v); };
function drawRuns() {
  $('pr-runs').innerHTML = P.runs.map((r, i) => `<div class="pr-run" data-i="${i}">
    <label>Distance (km)<input data-k="d" inputmode="decimal" placeholder="e.g. 8" value="${esc(r.d || '')}"></label>
    <label>Time<input data-k="t" inputmode="numeric" placeholder="e.g. 46:30" value="${esc(r.t || '')}"></label>
    <label>Effort<select data-k="e">${Object.keys(EFFORT).map(k => `<option value="${k}"${(r.e || 'steady') === k ? ' selected' : ''}>${EFFORT[k].name}</option>`).join('')}</select></label>
    <label>Climb (m) · optional<input data-k="c" inputmode="numeric" placeholder="e.g. 80" value="${esc(r.c || '')}"></label>
    ${P.runs.length > 1 ? `<button type="button" class="x" data-del="${i}" aria-label="Remove run ${i + 1}">×</button>` : ''}
  </div>`).join('');
  $('pr-add').hidden = P.runs.length >= 5;
}
$('pr-runs').addEventListener('input', e => { const box = e.target.closest('.pr-run'); if (!box) return; P.runs[+box.dataset.i][e.target.dataset.k] = e.target.value; store.set('runs', P.runs); });
$('pr-runs').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (!b) return; P.runs.splice(+b.dataset.del, 1); store.set('runs', P.runs); drawRuns(); });
$('pr-add').addEventListener('click', () => { if (P.runs.length < 5) { P.runs.push({}); drawRuns(); $('pr-runs').lastElementChild.querySelector('input').focus(); } });
function predictFlat() {
  const D = S.dist.km, out = [];
  P.runs.forEach(r => {
    const d = parseFloat(String(r.d || '').replace(',', '.')), t = readTime(r.t), e = EFFORT[r.e || 'steady'];
    if (!(d >= 0.8 && d <= 60) || !t) return;
    const pace = t / d; if (pace < 150 || pace > 1080) return;          // between 2:30 and 18:00 per km
    const climb = Math.max(0, Math.min(2000, parseFloat(r.c) || 0));
    const flat = Math.max(t * 0.85, t - climb * 0.5);                   // about 50 s per 100 m of climbing
    const pred = flat * e.f * Math.pow(D / d, 1.06);
    out.push({ pred, w: e.w / (1 + Math.abs(Math.log(D / d))), hard: e.w >= 3 });
  });
  if (!out.length) return null;
  const W = out.reduce((a, x) => a + x.w, 0), mu = out.reduce((a, x) => a + x.w * Math.log(x.pred), 0) / W;
  const sd = Math.sqrt(out.reduce((a, x) => a + x.w * (Math.log(x.pred) - mu) ** 2, 0) / W);
  const band = Math.min(0.1, Math.max(out.some(x => x.hard) ? 0.025 : 0.05, sd));
  return { flat: Math.exp(mu), band, n: out.length };
}
function showPred() {
  if (!P.on || !R) return;
  const f = predictFlat(); if (!f) { $('pr-out').hidden = true; return; }
  const k = R.gap > 0 ? R.target / (R.gap * km()) : 1;                  // this course vs a flat road
  const course = f.flat * (S.watch && S.dist.watchKm ? S.dist.watchKm / S.dist.km : 1) * k;
  let cost = null;
  if (S.wx) { const st = startSec() || 6 * 3600, a = wxAt(st), b = wxAt(st + course); cost = (heatCost(a.t, a.rh) + heatCost(b.t, b.rh)) / 2; }
  const fin = course * (1 + (cost || 0) / 100);
  P.res = fin;
  $('pr-lab').textContent = 'Your predicted ' + S.dist.label + ' time';
  $('pr-final').textContent = fmtDur(fin);
  $('pr-range').textContent = 'Likely between ' + fmtDur(fin * (1 - f.band)) + ' and ' + fmtDur(fin * (1 + f.band)) + ' · ' + fmtPace(fin / km()) + ' /km · from ' + f.n + (f.n === 1 ? ' run' : ' runs');
  $('pr-flat').textContent = fmtDur(f.flat);
  const dh = course - f.flat;
  $('pr-hill').textContent = fmtDur(course);
  $('pr-hill2').textContent = S.dist.estimated ? 'course hills not mapped yet' : 'with this course\'s hills (' + (dh >= 0 ? '+' : '−') + fmtDur(Math.abs(dh)) + ')';
  $('pr-heat').textContent = cost == null ? '–' : fmtDur(fin);
  $('pr-heat2').textContent = cost == null ? 'heat added when the forecast appears (about 2 weeks out)' : cost > 0 ? 'with race-morning heat (+' + cost.toFixed(1) + '%)' : 'race morning looks cool: no heat penalty';
  $('pr-out').hidden = false;
}
$('pr-go').addEventListener('click', () => {
  const f = predictFlat();
  if (!f) { $('pr-err').textContent = 'Add at least one run with a distance and a time (like 8 km in 46:30).'; $('pr-out').hidden = true; return; }
  $('pr-err').textContent = ''; P.on = true; showPred();
});
/* runs logged in Playground Quest (main site), borrowed from this device through bridge.html */
const BRIDGE = window.TRP_BRIDGE || 'https://runnersplayground.com/bridge.html';
let bridgeFrame = null;
const questRuns = () => new Promise((res, rej) => {
  const origin = new URL(BRIDGE).origin;
  const done = (fn, v) => { clearTimeout(timer); window.removeEventListener('message', onMsg); fn(v); };
  const onMsg = e => { if (e.origin === origin && e.data && e.data.type === 'trp-runs') done(res, e.data); };
  const timer = setTimeout(() => done(rej, new Error('timeout')), 5000);
  window.addEventListener('message', onMsg);
  const ask = () => bridgeFrame.contentWindow.postMessage({ type: 'trp-get-runs' }, origin);
  if (bridgeFrame && bridgeFrame.dataset.ready) ask();
  else {
    if (!bridgeFrame) { bridgeFrame = document.createElement('iframe'); bridgeFrame.src = BRIDGE; bridgeFrame.title = 'Playground Quest runs'; bridgeFrame.hidden = true; bridgeFrame.setAttribute('aria-hidden', 'true'); bridgeFrame.tabIndex = -1; document.body.appendChild(bridgeFrame); }
    bridgeFrame.addEventListener('load', () => { bridgeFrame.dataset.ready = '1'; ask(); }, { once: true });
  }
});
$('pr-quest').addEventListener('click', async () => {
  const info = $('pr-info'), btn = $('pr-quest');
  $('pr-err').textContent = ''; info.textContent = 'Looking for your Quest runs…'; btn.disabled = true;
  try {
    const j = await questRuns();
    const D = S.dist.km, now = Date.now();
    const pick = (j.runs || []).map(r => {
      const age = Math.max(0, (now - new Date(r.d + 'T12:00:00')) / 864e5);
      return { ...r, score: (EFFORT[r.e] || EFFORT.steady).w / (1 + Math.abs(Math.log(D / r.km))) * (1 - age / 84) };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
    if (!pick.length) {
      info.innerHTML = j.hasQuest
        ? 'No Quest runs with a <b>time</b> from the last 6 weeks yet. Next time you log a run in <a href="https://runnersplayground.com/quest.html">Playground Quest</a>, add your time and effort.'
        : 'No Quest runs on this device yet. Log your runs (with your time) in <a href="https://runnersplayground.com/quest.html">Playground Quest</a> and they\'ll show up here.';
      return;
    }
    P.runs = pick.sort((a, b) => b.d.localeCompare(a.d)).map(r => ({ d: String(r.km), t: fmtDur(r.t), e: EFFORT[r.e] ? r.e : 'steady', c: '' }));
    store.set('runs', P.runs); drawRuns();
    const guessed = pick.filter(r => !EFFORT[r.e]).length;
    info.textContent = `Added ${pick.length} recent ${pick.length === 1 ? 'run' : 'runs'} from Playground Quest.` + (guessed ? (guessed === 1 ? ' One had no effort, so we set it to Steady.' : ` ${guessed} had no effort, so we set them to Steady.`) + ' Change it if needed.' : '') + ' Add the climb if you know it.';
    P.on = true; showPred();
  } catch (e) {
    info.textContent = "Couldn't reach your Quest runs on this device. Type your runs in below instead.";
  } finally { btn.disabled = false; }
});
$('pr-use').addEventListener('click', () => { if (!P.res) return; setGoal(P.res); toast('Goal set to ' + fmtDur(P.res) + '. Your splits are ready!'); });
drawRuns();

/* ---------- remember + boot ---------- */
const saveLocal = () => store.set('last', { race: S.race.id, d: S.dist.key, goal: Math.round(S.goal), strat: S.strat, kg: S.mass, cad: S.cad, bus: S.bus, w: S.watch });
const boot = () => {
  if (!RACES.length) { $('r-name').textContent = 'No races yet: add one in races.js'; return; }
  const opt = r => `<option value="${esc(r.id)}">${esc(r.name)}${r.date ? ' · ' + esc(fmtDate(new Date(r.date + 'T00:00:00'))) : ''}</option>`;
  const up = RACES.filter(r => !isDone(r)).sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')));
  const past = RACES.filter(isDone).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  $('race-sel').innerHTML = (up.length ? `<optgroup label="Upcoming races">${up.map(opt).join('')}</optgroup>` : '') + (past.length ? `<optgroup label="Past races">${past.map(opt).join('')}</optgroup>` : '');
  const q = new URLSearchParams(location.search), last = store.get('last') || {};
  const fromUrl = q.has('race');
  const race = RACES.find(r => r.id === (q.get('race') || last.race)) || up[0] || RACES[0];
  const dist = race.distances.find(d => d.key === (fromUrl ? q.get('d') : last.race === race.id ? last.d : null)) || race.distances[0];
  const src = fromUrl ? { goal: parseT(q.get('t')), strat: q.get('s'), kg: +q.get('kg'), cad: +q.get('cad'), bus: q.get('bus'), w: q.get('w') === '1' } : (last.race === race.id ? last : {});
  S.goal = src.goal || parseT(dist.goal) || 3600;
  if (STRAT_HELP[src.strat]) S.strat = src.strat;
  if (src.kg >= 40 && src.kg <= 120) S.mass = src.kg;
  if (src.cad >= 150 && src.cad <= 200) S.cad = src.cad;
  S.bus = src.bus || ''; S.watch = !!src.w;
  $('mass').value = S.mass; $('cad').value = S.cad; $('bus').value = S.bus;
  setupRace(race.id, dist.key);
};
boot();
}
