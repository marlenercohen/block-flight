// Headless checks for Block Flight. usage: npm run check
import { initPhysics, FlightSim } from '../src/physics.js';
import { CONFIG } from '../src/config.js';
import { CUE, EFFECT, FAMILIARITY, IMAGES, TUTORIAL_IMAGES, colorForCue, preferredXForCue, preferredYForFamiliarity, ruleForTrial, blockForTrial, trialInBlock, hitStrength } from '../src/experiment.js';
import { buildPlan, validatePlan } from '../src/plan.js';
import { INTRO_CARD, TUTORIAL_STEPS } from '../src/tutorial.js';
import { SESSION, applyUrlOverrides } from '../src/session_config.js';
await initPhysics();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t, cues = [0, 0.25, 0.5, 0.75, 1];

console.log('--- 1. the two learning rules');
ok(cues.every((c, i) => near(preferredXForCue(c, 'initial'), [0.2, 0.35, 0.5, 0.65, 0.8][i])), 'initial colour rule: blue 0.2 ... red 0.8, linear in between');
ok(cues.every((c, i) => near(preferredXForCue(c, 'reversed'), [0.8, 0.65, 0.5, 0.35, 0.2][i])), 'reversed colour rule: blue 0.8 ... red 0.2');
ok(near(preferredYForFamiliarity('novel'), 0) && near(preferredYForFamiliarity('familiar'), 1), 'familiarity rule: novel -> bottom edge (v = 0), familiar -> top edge (v = 1); no phase argument, so it can never reverse');
const SW = [60, 110, 160], ph = n => ruleForTrial(n, SW);
ok([1, 30, 60].every(n => ph(n) === 'initial') && [61, 90, 110].every(n => ph(n) === 'reversed') && [111, 140, 160].every(n => ph(n) === 'initial') && [161, 180, 200].every(n => ph(n) === 'reversed'), 'switch points [60, 110, 160]: trials 1-60 original, 61-110 reversed, 111-160 original, 161-200 reversed (switches fall exactly between 60|61, 110|111, 160|161)');
ok([1, 60, 61, 110, 111, 160, 161, 200].map(n => blockForTrial(n, SW)).join() === '1,1,2,2,3,3,4,4' && [1, 60, 61, 110, 111, 160, 161, 200].map(n => trialInBlock(n, SW)).join() === '1,60,1,50,1,50,1,40' && blockForTrial(null, SW) === 0, 'block number (1-4) and trial-in-block (1-50) are right on every boundary; practice trials are block 0');
ok(ruleForTrial(null, SW) === 'initial' && ruleForTrial(70, null) === 'initial' && ruleForTrial(70, []) === 'initial' && ruleForTrial(70, 60) === 'reversed' && ruleForTrial(60, 60) === 'initial' && [10, 20, 30, 40].map(n => ruleForTrial(n, [15, 25, 35])).join() === 'initial,reversed,initial,reversed', 'practice, "never", a single number and arbitrary switch lists are handled');
ok(cues.map(c => colorForCue(c)).every((x, i, a) => i === 0 || x !== a[i - 1]), 'five distinct colours');

console.log('--- 2. hit strength (same function and parameters as the tower game v2.2+; no cut-off, no penalty)');
const H = (cue, fam, u, v, ph = 'initial') => hitStrength({ cue, familiarity: fam, u, v, phase: ph });
ok(near(H(0, 'novel', 0.2, 0).multiplier, 2.2) && near(H(0, 'familiar', 0.2, 1).multiplier, 2.2) && near(EFFECT.baseline, 0.25) && near(EFFECT.peak, 2.2) && near(EFFECT.horizontalWidth, 0.15) && near(EFFECT.verticalWidth, 0.35), 'parameters: baseline 0.25, peak 2.2, horizontal width 0.15 (unchanged), vertical width 0.35 (broad); optimum (colour optimum, correct edge) gives 2.2');
const gv = d => Math.exp(-d * d / (2 * 0.35 * 0.35));
ok(near(H(0, 'novel', 0.35, 0.35).multiplier, 0.25 + 1.95 * Math.exp(-0.5) * gv(0.35), 1e-9) && near(H(0, 'novel', 0.5, 0.5).multiplier, 0.25 + 1.95 * Math.exp(-2) * gv(0.5), 1e-9), 'multiplier = 0.25 + 1.95 * Gh * Gv with the horizontal Gaussian (width 0.15) and the vertical Gaussian (width 0.35) around the correct edge');
{ const v = (f, x) => H(0, f, 0.2, x).multiplier; const rel = (f, x) => (v(f, x) - 0.25) / 1.95;   // vertical component alone (colour optimum clicked)
  ok(Math.abs(rel('novel', 0.1) - rel('familiar', 0.9)) < 1e-9 && Math.abs(rel('novel', 0.3) - rel('familiar', 0.7)) < 1e-9 && [0.1, 0.3, 0.5, 0.8].every(x => Math.abs(rel('novel', x) - rel('familiar', 1 - x)) < 1e-9), 'vertical rule is a mirror image: novel at v equals familiar at 1 - v');
  ok(Math.abs(rel('novel', 0) - 1) < 1e-12 && rel('novel', 0.1) > 0.95 && rel('novel', 0.2) > 0.8 && rel('novel', 0.3) > 0.68, `broad high-reward region at the correct edge (component 1.00 at the edge, ${rel('novel', 0.1).toFixed(2)} at 0.1, ${rel('novel', 0.2).toFixed(2)} at 0.2, ${rel('novel', 0.3).toFixed(2)} at 0.3 from it)`);
  let mono = true; for (let x = 0; x < 1; x += 0.01) if (rel('novel', x + 0.01) > rel('novel', x) + 1e-12 || rel('familiar', x + 0.01) < rel('familiar', x) - 1e-12) mono = false;
  ok(mono && rel('novel', 0.5) > 0.3 && rel('novel', 0.5) < 0.45 && rel('novel', 1) < 0.02, `falls smoothly and monotonically away from the correct edge (${rel('novel', 0.5).toFixed(2)} in the middle, ${rel('novel', 1).toFixed(3)} at the opposite edge)`);
  ok(rel('novel', 0.2) > 0.8 && rel('familiar', 0.8) > 0.8 && 0.25 + 1.95 * rel('novel', 0.2) > 1.8, 'a participant who follows the instructions ("toward the bottom / top") gets a strong hit, not a penalised one'); }
let minM = 9, maxStep = 0, lastM = null; for (let u = 0; u <= 1.0001; u += 0.01) for (let v = 0; v <= 1.0001; v += 0.01) { const m = H(0.25, 'familiar', u, v).multiplier; minM = Math.min(minM, m); }
for (let u = 0; u < 1; u += 0.005) maxStep = Math.max(maxStep, Math.abs(H(0.5, 'novel', u + 0.005, 0.2).multiplier - H(0.5, 'novel', u, 0.2).multiplier));
ok(minM >= 0.25 - 1e-9 && maxStep < 0.1, `every click on the face gives an impulse (minimum multiplier ${minM.toFixed(3)} > 0; no cut-off) and the function is continuous (max step ${maxStep.toFixed(3)} per 0.005)`);
const r = H(0, 'novel', 0.5, 0, 'reversed'); ok(near(r.optimalU, 0.8) && near(r.horizontalError, -0.3) && near(r.optimalV, 0) && near(r.verticalError, 0), 'errors are signed (click - optimum) and use the current phase');
ok(near(H(0.5, 'novel', 0.5, 0.2, 'initial').multiplier, H(0.5, 'novel', 0.5, 0.2, 'reversed').multiplier) && near(H(0, 'novel', 0.2, 0.2, 'initial').optimalV, H(0, 'novel', 0.2, 0.2, 'reversed').optimalV) && near(H(0, 'familiar', 0.2, 0.2, 'initial').gV, H(0, 'familiar', 0.2, 0.2, 'reversed').gV), 'the middle colour and the vertical optimum are the same in both phases');

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

console.log('--- 4. trial plan: 200 trials in four blocks (60 / 50 / 50 / 40), image limits, balance');
const spec = { towers: [{ blocks: [{ size: CONFIG.block.size, pos: CONFIG.block.start, image: true, cue: 'random' }] }] };
const cfg = { ...spec, nTrials: SESSION.nTrials, orderMode: 'sequence', imageIds: IMAGES.ids, novelProportion: 0.5, lagChoices: SESSION.lagChoices, cueValues: SESSION.cueValues, cuePolicy: 'balanced', phaseBreaks: SESSION.switchPoints };
ok(SESSION.nTrials === 200 && SESSION.switchPoints.join() === '60,110,160', 'defaults: 200 trials, colour rule switches after trials 60, 110 and 160 (both configurable)');
let bad = 0, worstNovel = 0.5, worstCue = 0, lags = new Set(), maxD = 0;
for (let seed = 1; seed <= 60; seed++) { const pl = buildPlan({ ...cfg, seed }); if (pl.trials.length !== 200 || pl.trials.some(t => t.slots.length !== 1)) bad++; try { validatePlan(pl); } catch { bad++; }
  const cnt = {}; for (const t of pl.trials) cnt[t.slots[0].imageId] = (cnt[t.slots[0].imageId] ?? 0) + 1; if (Object.values(cnt).some(n => n > 2)) bad++; maxD = Math.max(maxD, Object.keys(cnt).length);
  for (let k = 0; k < 4; k++) { let nv = 0, fm = 0; const cc = {}; for (const t of pl.trials.filter(x => blockForTrial(x.trialNumber, SESSION.switchPoints) === k + 1)) { const s = t.slots[0]; if (s.expected.familiarity === 'novel') nv++; else { fm++; lags.add(s.expected.lagTrials); } cc[s.cue] = (cc[s.cue] ?? 0) + 1; }
    const sh = nv / (nv + fm); if (nv + fm !== [60, 50, 50, 40][k]) bad++; if (Math.abs(sh - 0.5) > Math.abs(worstNovel - 0.5)) worstNovel = sh; const c = Object.values(cc); if (c.length !== 5) bad++; worstCue = Math.max(worstCue, (Math.max(...c) - Math.min(...c)) / (c.reduce((x, y) => x + y) / 5)); } }
ok(bad === 0, '60 seeds: always 200 trials (blocks of 60 / 50 / 50 / 40) with one block each, every image at most twice, validatePlan passes');
ok(worstNovel > 0.34 && worstNovel < 0.66, `novel share near 50% within every block (worst block over 60 seeds: ${(100 * worstNovel).toFixed(1)}%)`);
ok(worstCue < 0.45, `five colour cues used in every block and balanced (largest max-min spread ${(100 * worstCue).toFixed(0)}% of the mean count; 8-12 per cue)`);
ok(lags.size === 4 && [...lags].every(l => [1, 2, 3, 5].includes(l)), `repetition lags are exactly 1, 2, 3, 5 (${[...lags].sort((a, b) => a - b)})`);
ok(maxD < IMAGES.ids.length - 10 && !IMAGES.ids.some(id => TUTORIAL_IMAGES.ids.includes(id)), `image pool (${IMAGES.ids.length}) is large enough (up to ${maxD} distinct pictures in a 200-trial session) and separate from the ${TUTORIAL_IMAGES.ids.length} practice pictures`);
const mk = () => ({ ...SESSION, timing: { ...SESSION.timing } }), q = applyUrlOverrides(mk(), '?trials=40&switches=10,20,30&seed=7&tutorial=0&lags=1,2');
ok(q.nTrials === 40 && q.switchPoints.join() === '10,20,30' && q.seed === 7 && q.tutorial === false && q.lagChoices.join() === '1,2', 'URL overrides: trials, switches, seed, tutorial, lags');
ok(applyUrlOverrides(mk(), '?reversal=15').switchPoints.join() === '15' && applyUrlOverrides(mk(), '?reversal=0').switchPoints.length === 0 && applyUrlOverrides(mk(), '?switches=').switchPoints.length === 0, '?reversal=N is one switch; ?reversal=0 or an empty ?switches= means never');

console.log('--- 5. instructions');
const all = [INTRO_CARD, ...TUTORIAL_STEPS].map(s => s.text).join('\n');
ok(!/\b(left|right|blue|red|purple|reverse|reversal|mirror|trial \d+)\b/i.test(all) && !/\b0\.\d/.test(all) && !/\b\d+ trials\b/.test(all), 'instructions do not reveal the colour mapping, when or how often switches happen, or any coordinates');
ok(/color helps you CAN SWITCH/.test(all) && /more than once/.test(all) && /not be told when/.test(all) && /new and familiar pictures does not change/.test(all), 'instructions say explicitly that the colour rule can switch (more than once, without notice) and that the new / familiar rule stays the same');
ok(/BOTTOM/.test(all) && /TOP/.test(all) && /color of a block also gives you a hint/.test(all) && /ONE click/.test(all) && /as far as/.test(all), 'instructions state: one click, make it travel far, new -> bottom, familiar -> top, colour is a hint, patterns may change');
ok(TUTORIAL_STEPS.at(-1).button === 'Begin' && TUTORIAL_STEPS.filter(s => s.practice).length === 4, 'four practice blocks, last card starts the experiment');
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
