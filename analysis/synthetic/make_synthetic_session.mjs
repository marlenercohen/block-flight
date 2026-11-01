// Writes simulated Block Flight sessions in the real log format (schema blockflight-log/1) to test the MATLAB analysis code. NOT real data.
// usage: node analysis/synthetic/make_synthetic_session.mjs <outDir> [nParticipants=3] [nTrials=200] [seed=1]
// The simulated participant learns the colour rule within each block (horizontal error shrinks, resets partly after each switch), judges familiarity better over time, and has a built-in
// attention trade-off: on trials where the familiarity judgement is wrong the horizontal error is larger. Reaction times are slower after large errors. Real data will look different.
import fs from 'node:fs'; import path from 'node:path';
import { buildPlan } from '../../src/plan.js';
import { ImageHistory } from '../../src/history.js';
import { mulberry32 } from '../../src/rng.js';
import { IMAGES, hitStrength, ruleForTrial, blockForTrial, trialInBlock, colorForCue } from '../../src/experiment.js';
const [outDir = 'synthetic_out', nPart = 3, nTr = 200, seed0 = 1] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const SW = [60, 110, 160].filter(x => x < +nTr), clampv = x => Math.min(1, Math.max(0, x));
const spec = { towers: [{ blocks: [{ size: [1.2, 1.2, 0.9], pos: [0, 0.6, 2], image: true, cue: 'random' }] }] };
for (let p = 0; p < +nPart; p++) {
  const rng = mulberry32(+seed0 * 100 + p + 1), gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rng(); return (u - 3) / Math.sqrt(0.5); };
  const plan = buildPlan({ ...spec, nTrials: +nTr, orderMode: 'sequence', imageIds: IMAGES.ids, novelProportion: 0.5, lagChoices: [1, 2, 3, 5], cueValues: [0, 0.25, 0.5, 0.75, 1], cuePolicy: 'uniform', phaseBreaks: SW, seed: +seed0 * 100 + p + 1 });
  const hist = new ImageHistory(), trials = [], sessionId = `synth${String(p + 1).padStart(2, '0')}${(+seed0).toString(16)}`; let t0 = 5000;
  for (const pt of plan.trials) {
    const s = pt.slots[0], { info } = hist.present([s.imageId]), n = pt.trialNumber, phase = ruleForTrial(n, SW), tib = trialInBlock(n, SW), blk = blockForTrial(n, SW), fam = info[s.imageId].familiarity;
    const learn = Math.exp(-tib / (12 + 4 * p)), globalLearn = Math.exp(-n / 80), cuePos = s.cue;
    const pCorrect = 0.62 + 0.3 * (1 - Math.exp(-n / 40)) - (tib < 6 ? 0.03 : 0);                  // familiarity judgement improves over the session
    const correctHalf = rng() < pCorrect;
    let sdH = 0.07 + (0.28 * learn + 0.10 * globalLearn) * (blk === 1 ? 1 : 0.8); if (!correctHalf) sdH *= 1.5;       // attention trade-off: wrong recognition -> worse colour accuracy
    const opt = hitStrength({ cue: s.cue, familiarity: fam, u: 0.5, v: 0.5, phase });
    const u = clampv(opt.optimalU + sdH * gauss() + (rng() < 0.15 * learn ? (opt.optimalU > 0.5 ? -0.3 : 0.3) : 0));
    const vEdge = fam === 'familiar' ? 1 : 0, dv = correctHalf ? Math.abs(0.18 * rng() + 0.1 * rng()) * (1 - 0.4 * (1 - Math.exp(-n / 50))) + 0.02 : 0.55 + 0.4 * rng();
    const v = clampv(fam === 'familiar' ? 1 - Math.min(0.5, dv) * (correctHalf ? 1 : 1) : Math.min(0.5, dv)) ; const vv = correctHalf ? v : clampv(fam === 'familiar' ? 0.5 - 0.45 * rng() : 0.5 + 0.45 * rng());
    const st = hitStrength({ cue: s.cue, familiarity: fam, u, v: vv, phase }), J = 3.2 * st.multiplier, dist = (J * J) / 9.81 * (0.97 + 0.06 * rng());
    const rt = Math.round(Math.exp(Math.log(950) + 0.35 * gauss() + 0.6 * (Math.abs(st.horizontalError) + Math.abs(st.verticalError) * 0.5) - 0.25 * (1 - globalLearn)));
    const missed = rng() < 0.01;
    trials.push({ sessionId, phase: 'experiment', trialIndexOverall: n + 4, trialNumber: n, tutorialTrialNumber: null, trialId: `${sessionId}-E${n}`, colorRulePhase: phase, blockNumber: blk, trialInBlock: tib, switchPoints: SW,
      image: { imageId: s.imageId, ...info[s.imageId], plannedRole: s.role, plannedLagTarget: s.lagTarget, plannedFallback: s.fallback }, cue: s.cue, colorHex: '#' + colorForCue(s.cue).toString(16).padStart(6, '0'), optimal: { u: st.optimalU, v: st.optimalV },
      startedAt: new Date(1.7e12 + (t0 += 4500)).toISOString(), stimulusOnsetSessionMs: t0, click: missed ? null : { tMs: rt, reactionTimeMs: rt, pointerType: 'mouse', face: '+z', u, v: vv, optimalU: st.optimalU, optimalV: st.optimalV, horizontalError: st.horizontalError, verticalError: st.verticalError,
        absHorizontalError: Math.abs(st.horizontalError), absVerticalError: Math.abs(st.verticalError), gH: st.gH, gV: st.gV, multiplier: st.multiplier, impulse: J, launchSpeed: J, ignoredClicksBefore: 0 },
      ignoredClicks: [], outcome: missed ? null : { distanceAway: dist, displacement: dist, netRotationDeg: dist > 3 ? 90 : 0, timeToRestS: 1 + dist / 4 }, result: missed ? 'no_click' : 'completed' });
  }
  const J = { schema: 'blockflight-log/1', session: { sessionId, startedAt: new Date(1.7e12).toISOString(), appVersion: 'synthetic', experimentConfig: { game: 'block-flight', colorRule: { switchPoints: SW }, synthetic: true }, plan: { seed: +seed0 * 100 + p + 1 } }, trials, archivedSessions: [], exportedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, `blockflight_${sessionId}_synthetic.json`), JSON.stringify(J, null, 1)); console.log('wrote', sessionId, trials.length, 'trials');
}
