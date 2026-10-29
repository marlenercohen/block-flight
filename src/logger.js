// Block Flight behavioural logger. It only OBSERVES the game (main.js calls it). Data live in memory and in sessionStorage (so an accidental refresh keeps them) and are downloaded by
// the participant / researcher as JSON or CSV. Nothing is ever sent anywhere. No names, e-mails or IPs; the session ID is random.
//
// JSON layout (schema blockflight-log/1): { schema, session: {...}, trials: [ trial ], archivedSessions: [...], exportedAt }
//   session: sessionId, startedAt, appVersion, device info, inputObserved, plan (seed, stats, per-trial image/cue/role), experimentConfig (rules, hit-strength parameters, launch physics,
//            timing, session settings), instructionNavigation (Next/Back moves on the instruction cards)
//   trial:   phase ('tutorial' | 'experiment'), trialNumber (experimental trials 1..N; tutorial trials have null and tutorialTrialNumber), colorRulePhase ('initial' | 'reversed'),
//            image {imageId, presentationNumber, familiarity, previousTrial, lagTrials, interveningTrials, interveningDistinctImages, planned...}, cue, colorHex,
//            optimal {u, v} for THIS trial (colour rule phase and familiarity applied), click {...} (null if no click), outcome {...} (physical result), result ('completed' | 'no_click' | 'abandoned')
//   click:   time, screen position, face coordinates u (0 left .. 1 right) and v (0 bottom .. 1 top) of the click on the picture face, signed and absolute errors from the optimum,
//            the Gaussian components gH / gV, the hit-strength multiplier, the impulse that was applied, and the clicks that were ignored before it (off the picture face).
//   outcome: displacement vector and length, distance travelled away from the camera, net and total rotation, peak height, path length, airborne time, time to rest, whether it left the platform.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const SCHEMA = 'blockflight-log/1';
const KEY = 'blockflight_log', ARCHIVE_KEY = 'blockflight_log_archive';   // different keys from the block-game versions so stored data never mixes

const randomId = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
const iso = () => new Date().toISOString();
const r3 = v => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const r5 = v => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100000) / 100000);

/** What the browser reports (observed) and what we guess from it (inferred). */
function environment() {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  const brand = (uad?.brands || []).filter(b => !/not.?a.?brand/i.test(b.brand)).map(b => `${b.brand} ${b.version}`)[0];
  const browser = brand ?? (/Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'unknown');
  const os = uad?.platform || (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown');
  const touchPoints = navigator.maxTouchPoints || 0;
  const coarse = matchMedia('(pointer: coarse)').matches, hover = matchMedia('(hover: hover)').matches;
  const shortSide = Math.min(screen.width, screen.height);
  // Inference only: browsers cannot tell a phone from a tablet or a trackpad from a mouse reliably.
  const category = touchPoints > 0 && coarse ? (shortSide < 600 ? 'phone' : 'tablet') : 'desktop/laptop';
  return {
    observed: {
      browser, os, userAgentDataAvailable: !!uad,
      screenWidth: screen.width, screenHeight: screen.height, devicePixelRatio: window.devicePixelRatio,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      orientation: screen.orientation?.type ?? (innerWidth >= innerHeight ? 'landscape' : 'portrait'),
      maxTouchPoints: touchPoints, pointerCoarse: coarse, hoverCapable: hover,
    },
    inferred: { deviceCategory: category, note: 'deviceCategory is a heuristic guess from touch support and screen size; trackpad vs mouse cannot be distinguished. Actual input devices are in session.inputObserved (counts of pointerdown by pointerType).' },
  };
}

export class Logger {
  constructor() {
    this.active = null; this.t0 = null; this.perfOrigin = performance.now();
    let restored = null; try { restored = JSON.parse(sessionStorage.getItem(KEY)); } catch { /* ignore */ }
    this.archive = []; try { this.archive = JSON.parse(sessionStorage.getItem(ARCHIVE_KEY)) ?? []; } catch { /* ignore */ }
    if (restored?.schema === SCHEMA && restored.trials?.length) {   // keep an earlier (interrupted) session's data instead of overwriting it
      for (const t of restored.trials) if (!t.endedAt) { t.result = 'abandoned'; t.note = 'page reloaded or closed before the trial ended'; }
      this.archive.push(restored); try { sessionStorage.setItem(ARCHIVE_KEY, JSON.stringify(this.archive)); } catch { /* ignore */ }
    }
    this.data = { schema: SCHEMA, session: { sessionId: randomId(), startedAt: iso(), appVersion: APP_VERSION, ...environment(), inputObserved: { mouse: 0, touch: 0, pen: 0, other: 0 } }, trials: [] };
    this.counts = { experiment: 0, tutorial: 0 };
    addEventListener('pagehide', () => { this.endTrial('abandoned'); this.persist(); });
    this.persist();
  }
  get sessionId() { return this.data.session.sessionId; }
  sessionMs() { return r3(performance.now() - this.perfOrigin); }
  trialMs() { return this.t0 === null ? null : r3(performance.now() - this.t0); }

  /** meta: { phase, colorRulePhase, reversalAfterTrial, image:{...}, cue, colorHex, optimal:{u,v}, physics } */
  beginTrial(meta) {
    const phase = meta.phase, n = ++this.counts[phase];
    const t = {
      sessionId: this.sessionId, phase, trialIndexOverall: this.data.trials.length + 1,
      trialNumber: phase === 'experiment' ? n : null, tutorialTrialNumber: phase === 'tutorial' ? n : null,
      trialId: `${this.sessionId}-${phase === 'tutorial' ? 'T' : 'E'}${n}`,
      ...meta,
      startedAt: iso(), startSessionMs: this.sessionMs(), stimulusOnsetAt: null, stimulusOnsetSessionMs: null, endedAt: null, endSessionMs: null, durationMs: null,
      click: null, ignoredClicks: [], outcome: null, result: null,
    };
    this.data.trials.push(t); this.active = t; this.t0 = null; this.persist(); return t;
  }
  /** The block is visible and clickable: the trial clock (reaction time) starts. */
  stimulusOnset() { const t = this.active; if (!t) return; this.t0 = performance.now(); t.stimulusOnsetAt = iso(); t.stimulusOnsetSessionMs = this.sessionMs(); this.persist(); }
  ignoredClick(c) { const t = this.active; if (!t) return; this.countInput(c.pointerType); t.ignoredClicks.push({ tMs: this.trialMs(), screen: { x: r3(c.x), y: r3(c.y) }, reason: c.reason }); this.persist(); }
  countInput(pt) { const k = pt in this.data.session.inputObserved ? pt : 'other'; this.data.session.inputObserved[k]++; }
  /** The one click that launches the block. c: { pointerType, x, y, local, face, u, v, strength (from hitStrength), impulse, launchSpeed, direction } */
  click(c) {
    const t = this.active; if (!t) return; this.countInput(c.pointerType);
    const s = c.strength;
    t.click = {
      tMs: this.trialMs(), reactionTimeMs: this.trialMs(), tSessionMs: this.sessionMs(), pointerType: c.pointerType, screen: { x: r3(c.x), y: r3(c.y) },
      local: { x: r3(c.local.x), y: r3(c.local.y), z: r3(c.local.z) }, face: c.face, u: r5(c.u), v: r5(c.v),
      optimalU: r5(s.optimalU), optimalV: r5(s.optimalV), horizontalError: r5(s.horizontalError), verticalError: r5(s.verticalError),
      absHorizontalError: r5(Math.abs(s.horizontalError)), absVerticalError: r5(Math.abs(s.verticalError)), gH: r5(s.gH), gV: r5(s.gV), multiplier: r5(s.multiplier),
      impulse: r5(c.impulse), launchSpeed: r5(c.launchSpeed), direction: c.direction, ignoredClicksBefore: t.ignoredClicks.length,
    };
    this.persist();
  }
  setOutcome(o) { const t = this.active; if (!t) return; const q = {}; for (const [k, v] of Object.entries(o)) q[k] = typeof v === 'number' ? r5(v) : v; t.outcome = q; this.persist(); }
  endTrial(result) {
    const t = this.active; if (!t) return; if (t.endedAt) return;
    t.endedAt = iso(); t.endSessionMs = this.sessionMs(); t.durationMs = this.t0 === null ? null : r3(performance.now() - this.t0); t.result = result;
    this.active = null; this.persist();
  }
  persist() { try { sessionStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage full/unavailable: keep in memory */ } }
  fileStem() { return `blockflight_${this.sessionId}_${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`; }
  json() { return JSON.stringify({ ...this.data, archivedSessions: this.archive, exportedAt: iso() }, null, 1); }

  /** One row per trial (flattened). */
  csv() {
    const cols = ['sessionId', 'trialId', 'phase', 'trialNumber', 'tutorialTrialNumber', 'trialIndexOverall', 'colorRulePhase', 'imageId', 'familiarity', 'presentationNumber', 'previousTrial', 'lagTrials', 'interveningTrials', 'interveningDistinctImages',
      'cue', 'colorHex', 'optimalU', 'optimalV', 'result', 'stimulusOnsetSessionMs', 'reactionTimeMs', 'ignoredClicks', 'clickU', 'clickV', 'horizontalError', 'verticalError', 'absHorizontalError', 'absVerticalError', 'gH', 'gV', 'multiplier', 'impulse', 'launchSpeed',
      'displacement', 'distanceAway', 'dx', 'dy', 'dz', 'netRotationDeg', 'rotationPathDeg', 'peakHeight', 'pathLength', 'airborneS', 'timeToRestS', 'leftPlatform', 'durationMs'];
    const row = t => ({ ...t, ...t.image, optimalU: t.optimal?.u, optimalV: t.optimal?.v, ignoredClicks: t.ignoredClicks.length, clickU: t.click?.u, clickV: t.click?.v, reactionTimeMs: t.click?.reactionTimeMs,
      horizontalError: t.click?.horizontalError, verticalError: t.click?.verticalError, absHorizontalError: t.click?.absHorizontalError, absVerticalError: t.click?.absVerticalError, gH: t.click?.gH, gV: t.click?.gV,
      multiplier: t.click?.multiplier, impulse: t.click?.impulse, launchSpeed: t.click?.launchSpeed, ...(t.outcome ?? {}) });
    return [cols.join(','), ...this.data.trials.map(t => { const r = row(t); return cols.map(c => csvCell(r[c])).join(','); })].join('\n');
  }
  download(kind) {
    const text = kind === 'csv' ? this.csv() : this.json(), blob = new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${this.fileStem()}${kind === 'csv' ? '_trials' : ''}.${kind === 'json' ? 'json' : 'csv'}`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
function csvCell(v) { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
