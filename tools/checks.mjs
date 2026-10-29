// Headless checks for Block Flight. usage: npm run check
import { initPhysics, FlightSim } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { CUE, EFFECT, FAMILIARITY, IMAGES, TUTORIAL_IMAGES, colorForCue, preferredXForCue, preferredYForFamiliarity, ruleForTrial, hitStrength } from '../src/experiment.js';
import { buildPlan, validatePlan } from '../src/plan.js';
import { INTRO_CARD, TUTORIAL_STEPS } from '../src/tutorial.js';
import { SESSION, applyUrlOverrides } from '../src/session_config.js';
await initPhysics();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t, cues = [0, 0.25, 0.5, 0.75, 1];

console.log('--- 1. the two learning rules');
ok(cues.every((c, i) => near(preferredXForCue(c, 'initial'), [0.2, 0.35, 0.5, 0.65, 0.8][i])), 'initial colour rule: blue 0.2 ... red 0.8, linear in between');
ok(cues.every((c, i) => near(preferredXForCue(c, 'reversed'), [0.8, 0.65, 0.5, 0.35, 0.2][i])), 'reversed colour rule: blue 0.8 ... red 0.2');
ok(near(preferredYForFamiliarity('novel'), 0.2) && near(preferredYForFamiliarity('familiar'), 0.8), 'familiarity rule: novel 0.2, familiar 0.8 (no phase argument: it can never reverse)');
ok([1, 59, 60].every(n => ruleForTrial(n, 60) === 'initial') && [61, 100, 120].every(n => ruleForTrial(n, 60) === 'reversed') && ruleForTrial(null, 60) === 'initial' && ruleForTrial(70, null) === 'initial', 'the colour rule reverses exactly after the configured trial (practice and "never" handled)');
ok(cues.map(c => colorForCue(c)).every((x, i, a) => i === 0 || x !== a[i - 1]), 'five distinct colours');

console.log('--- 2. hit strength (same function and parameters as the tower game v2.2+; no cut-off, no penalty)');
const H = (cue, fam, u, v, ph = 'initial') => hitStrength({ cue, familiarity: fam, u, v, phase: ph });
ok(near(H(0, 'novel', 0.2, 0.2).multiplier, 2.2) && near(EFFECT.baseline, 0.25) && near(EFFECT.peak, 2.2) && near(EFFECT.horizontalWidth, 0.15) && near(EFFECT.verticalWidth, 0.15), 'parameters: baseline 0.25, peak 2.2, widths 0.15; optimum gives 2.2');
ok(near(H(0, 'novel', 0.35, 0.35).multiplier, 0.25 + 1.95 * Math.exp(-1), 1e-9) && near(H(0, 'novel', 0.5, 0.5).multiplier, 0.25 + 1.95 * Math.exp(-4), 1e-9), 'values match the tower game formula (both off by 0.15: 0.97; both off by 0.3 / 0.3 face centre: 0.29)');
let minM = 9, maxStep = 0, lastM = null; for (let u = 0; u <= 1.0001; u += 0.01) for (let v = 0; v <= 1.0001; v += 0.01) { const m = H(0.25, 'familiar', u, v).multiplier; minM = Math.min(minM, m); }
for (let u = 0; u < 1; u += 0.005) maxStep = Math.max(maxStep, Math.abs(H(0.5, 'novel', u + 0.005, 0.2).multiplier - H(0.5, 'novel', u, 0.2).multiplier));
ok(minM >= 0.25 - 1e-9 && maxStep < 0.1, `every click on the face gives an impulse (minimum multiplier ${minM.toFixed(3)} > 0; no cut-off) and the function is continuous (max step ${maxStep.toFixed(3)} per 0.005)`);
const r = H(0, 'novel', 0.5, 0.2, 'reversed'); ok(near(r.optimalU, 0.8) && near(r.horizontalError, -0.3) && near(r.optimalV, 0.2) && near(r.verticalError, 0), 'errors are signed (click - optimum) and use the current phase');
ok(near(H(0.5, 'novel', 0.5, 0.2, 'initial').multiplier, H(0.5, 'novel', 0.5, 0.2, 'reversed').multiplier) && near(H(0, 'novel', 0.2, 0.2, 'initial').optimalV, H(0, 'novel', 0.2, 0.2, 'reversed').optimalV), 'the middle colour and the vertical optimum are the same in both phases');

console.log('--- 3. physics: movement is a consistent, monotonic function of impulse strength');
const mults = []; for (let m = 0.25; m <= 2.2001; m += 0.05) mults.push(+m.toFixed(2));
const run = m => { const s = new FlightSim(); s.launch(CONFIG.launch.impulse * m); return s.runToRest(); };
const outs = mults.map(run), d = outs.map(o => o.distanceAway);
let dec = 0, worst = 0; for (let i = 1; i < d.length; i++) { if (d[i] < d[i - 1] - 0.02) dec++; worst = Math.max(worst, d[i] / d[i - 1] / Math.pow(mults[i] / mults[i - 1], 2)); }
console.log(`  distance away (m) for multipliers 0.25 / 0.5 / 1.0 / 1.5 / 2.2: ${[0.25, 0.5, 1.0, 1.5, 2.2].map(m => d[mults.indexOf(m)].toFixed(2)).join(' / ')}; rotation path (deg) ${[0.25, 0.5, 1.0, 1.5, 2.2].map(m => outs[mults.indexOf(m)].rotationPathDeg.toFixed(0)).join(' / ')}`);
ok(dec === 0, `distance never decreases when the multiplier increases (${mults.length} strengths, 0 decreases)`);
ok(worst < 1.2, `no cliffs: the largest step in distance is within ${((worst - 1) * 100).toFixed(0)}% of a smooth quadratic curve`);
ok(d.at(-1) / d[0] > 30 && d[0] < 0.2 && d.at(-1) > 4, `strong vs weak is obvious: ${d[0].toFixed(2)} m for the weakest click, ${d.at(-1).toFixed(2)} m for the best (x${(d.at(-1) / d[0]).toFixed(0)})`);
ok(outs.every(o => !o.leftPlatform && o.timeToRestS < 5), 'the block never leaves the 15 m runway and always comes to rest within 5 s');
const a1 = run(1.3), a2 = run(1.3); ok(a1.distanceAway === a2.distanceAway && a1.netRotationDeg === a2.netRotationDeg, 'identical impulse gives an identical movement (deterministic physics)');
ok(outs[mults.indexOf(2.2)].peakHeight > 0.05 && outs[mults.indexOf(1.5)].airborneS > 0 && outs[mults.indexOf(0.25)].airborneS === 0, 'strong hits visibly hop; the weakest slide');

console.log('--- 4. trial plan: 120 trials, image limits, balance');
const spec = { towers: [{ blocks: [{ size: CONFIG.block.size, pos: CONFIG.block.start, image: true, cue: 'random' }] }] };
const cfg = { ...spec, nTrials: SESSION.nTrials, orderMode: 'sequence', imageIds: IMAGES.ids, novelProportion: 0.5, lagChoices: SESSION.lagChoices, cueValues: SESSION.cueValues, cuePolicy: 'balanced', phaseBreakAfter: SESSION.reversalAfterTrial };
ok(SESSION.nTrials === 120 && SESSION.reversalAfterTrial === 60, 'defaults: 120 trials, colour rule reversed after trial 60 (both configurable)');
let bad = 0, worstNovel = [0.5, 0.5], worstCue = 0, lags = new Set(), maxD = 0;
for (let seed = 1; seed <= 100; seed++) { const pl = buildPlan({ ...cfg, seed }); if (pl.trials.length !== 120 || pl.trials.some(t => t.slots.length !== 1)) bad++; try { validatePlan(pl); } catch { bad++; }
  const cnt = {}; for (const t of pl.trials) cnt[t.slots[0].imageId] = (cnt[t.slots[0].imageId] ?? 0) + 1; if (Object.values(cnt).some(n => n > 2)) bad++; maxD = Math.max(maxD, Object.keys(cnt).length);
  [[1, 60], [61, 120]].forEach(([a, b], k) => { let nv = 0, fm = 0; const cc = {}; for (const t of pl.trials.filter(x => x.trialNumber >= a && x.trialNumber <= b)) { const s = t.slots[0]; if (s.expected.familiarity === 'novel') nv++; else { fm++; lags.add(s.expected.lagTrials); } cc[s.cue] = (cc[s.cue] ?? 0) + 1; }
    const sh = nv / (nv + fm); if (Math.abs(sh - 0.5) > Math.abs(worstNovel[k] - 0.5)) worstNovel[k] = sh; const c = Object.values(cc); if (c.length !== 5) bad++; worstCue = Math.max(worstCue, (Math.max(...c) - Math.min(...c)) / (c.reduce((x, y) => x + y) / 5)); }); }
ok(bad === 0, '100 seeds: always 120 trials with one block each, every image at most twice, validatePlan passes');
ok(worstNovel.every(x => x > 0.4 && x < 0.62), `novel share near 50% in each phase (worst ${(100 * worstNovel[0]).toFixed(1)}% / ${(100 * worstNovel[1]).toFixed(1)}%)`);
ok(worstCue < 0.2, `five colour cues balanced within each phase (largest spread ${(100 * worstCue).toFixed(1)}% of the mean count)`);
ok(lags.size === 4 && [...lags].every(l => [1, 2, 3, 5].includes(l)), `repetition lags are exactly 1, 2, 3, 5 (${[...lags].sort((a, b) => a - b)})`);
ok(maxD < IMAGES.ids.length - 10 && !IMAGES.ids.some(id => TUTORIAL_IMAGES.ids.includes(id)), `image pool (${IMAGES.ids.length}) is large enough (up to ${maxD} distinct per session) and separate from the ${TUTORIAL_IMAGES.ids.length} tutorial images`);
const q = applyUrlOverrides({ ...SESSION, timing: { ...SESSION.timing } }, '?trials=40&reversal=15&seed=7&tutorial=0&lags=1,2'); ok(q.nTrials === 40 && q.reversalAfterTrial === 15 && q.seed === 7 && q.tutorial === false && q.lagChoices.join() === '1,2', 'URL overrides: trials, reversal, seed, tutorial, lags');
ok(applyUrlOverrides({ ...SESSION, timing: { ...SESSION.timing } }, '?reversal=0').reversalAfterTrial === null, '?reversal=0 means never');

console.log('--- 5. instructions');
const all = [INTRO_CARD, ...TUTORIAL_STEPS].map(s => s.text).join('\n');
ok(!/\b(left|right|blue|red|purple|reverse|reversal|trial 60)\b/i.test(all) && !/\b0\.\d/.test(all), 'instructions do not reveal the colour mapping, the reversal or any coordinates');
ok(/BOTTOM/.test(all) && /TOP/.test(all) && /may sometimes change/.test(all) && /color of a block also gives you a hint/.test(all) && /ONE click/.test(all) && /as far as/.test(all), 'instructions state: one click, make it travel far, new -> bottom, familiar -> top, colour is a hint, patterns may change');
ok(TUTORIAL_STEPS.at(-1).button === 'Begin' && TUTORIAL_STEPS.filter(s => s.practice).length === 4, 'four practice blocks, last card starts the experiment');
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
