// Block Flight: one block per trial, one click, watch the block fly, next trial. Flow: instruction cards (Back / Next) with practice blocks -> N experimental trials -> end screen.
// The click position (u, v on the picture face) is turned into an impulse by the continuous hit-strength function (experiment.js); the impulse acts through the block's centre of mass,
// so the movement is the only feedback and depends on the impulse strength alone.
import { CONFIG } from './config.js';
import { CUE, FAMILIARITY, EFFECT, IMAGES, TUTORIAL_IMAGES, NEUTRAL_CUE, colorForCue, preferredXForCue, ruleForTrial, hitStrength } from './experiment.js';
import { SESSION, applyUrlOverrides } from './session_config.js';
import { initPhysics, FlightSim } from './physics.js';
import { SceneView } from './scene.js';
import { Logger, APP_VERSION } from './logger.js';
import { buildPlan } from './plan.js';
import { ImageHistory } from './history.js';
import { INTRO_CARD, TUTORIAL_STEPS } from './tutorial.js';
import * as ui from './screens.js';

applyUrlOverrides(SESSION);
document.body.classList.toggle('kiosk', !!SESSION.kiosk);
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const view = new SceneView($('c'));
const logger = new Logger();
await initPhysics();

// ---- images (both pools preloaded once; small JPEGs) ---------------------------------------------------------------
if (TUTORIAL_IMAGES.ids.some(id => IMAGES.ids.includes(id))) throw new Error('tutorial and experimental image pools overlap');
const images = {};
const load = (dir, id) => new Promise(res => { const im = new Image(); im.onload = () => { images[id] = im; res(); }; im.onerror = () => res(); im.src = `${import.meta.env.BASE_URL}${dir}/${id}.jpg`; });
await Promise.all([...IMAGES.ids.map(id => load(IMAGES.dir, id)), ...TUTORIAL_IMAGES.ids.map(id => load(TUTORIAL_IMAGES.dir, id))]);

// ---- session record --------------------------------------------------------------------------------------------------
const sess = logger.data.session, pxByCue = ph => Object.fromEntries(CUE.values.map(c => [c, preferredXForCue(c, ph)]));
sess.experimentConfig = {
  game: 'block-flight', appVersion: APP_VERSION, imagePool: { ids: IMAGES.ids, tutorialIds: TUTORIAL_IMAGES.ids, faceFraction: IMAGES.faceFraction },
  cue: CUE, familiarity: FAMILIARITY, hitStrength: { form: 'baseline + (peak - baseline) * Gh * Gv, G = exp(-d^2 / (2 w^2)); no horizontal cut-off, no penalty', ...EFFECT },
  colorRule: { reversalAfterTrial: SESSION.reversalAfterTrial, preferredXByCue: { initial: pxByCue('initial'), reversed: pxByCue('reversed') }, preferredYByFamiliarity: { novel: FAMILIARITY.novelPreferredY, familiar: FAMILIARITY.familiarPreferredY } },
  launch: { ...CONFIG.launch, note: 'impulse applied through the centre of mass; direction away from the camera raised by elevationDeg; forward-tumble angular velocity = pitchSpin x impulse' },
  block: CONFIG.block, platform: CONFIG.platform, settle: CONFIG.settle, gravity: CONFIG.gravity, fixedDt: CONFIG.fixedDt, camera: CONFIG.camera, session: { ...SESSION },
};
const physicsSnapshot = () => ({ impulseBase: CONFIG.launch.impulse, elevationDeg: CONFIG.launch.elevationDeg, pitchSpin: CONFIG.launch.pitchSpin, blockMass: CONFIG.block.mass, blockFriction: CONFIG.block.friction, platformFriction: CONFIG.platform.friction, gravity: CONFIG.gravity });

// ---- one trial ---------------------------------------------------------------------------------------------------------
const game = { state: 'idle', sim: null, trial: null, resolveClick: null, cue: null, familiarity: null, phase: 'initial', extraClicks: 0, clickPending: null };

/** meta: { phase: 'tutorial' | 'experiment', imageId, image (history info), cue, colorRulePhase, hint, label, planned } */
async function runTrial(meta) {
  const T = SESSION.timing, familiarity = meta.image.familiarity, colorRulePhase = meta.colorRulePhase, cue = meta.cue;
  const sim = new FlightSim(), s0 = hitStrength({ cue, familiarity, u: 0.5, v: 0.5, phase: colorRulePhase });   // only for the optimum
  Object.assign(game, { sim, cue, familiarity, phase: colorRulePhase, extraClicks: 0, state: 'blank' });
  view.setBlock(images[meta.imageId], colorForCue(cue)); view.setBlockVisible(false); view.sync(sim.body);
  ui.setTrialInfo(meta.label); ui.setHint(null);
  game.trial = logger.beginTrial({ phase: meta.phase, colorRulePhase, reversalAfterTrial: meta.phase === 'experiment' ? SESSION.reversalAfterTrial : null,
    image: { imageId: meta.imageId, ...meta.image, plannedRole: meta.planned?.role ?? null, plannedLagTarget: meta.planned?.lagTarget ?? null, plannedFallback: meta.planned?.fallback ?? null },
    cue, colorHex: '#' + colorForCue(cue).toString(16).padStart(6, '0'), optimal: { u: s0.optimalU, v: s0.optimalV }, physics: physicsSnapshot() });
  await sleep(T.blankMs);
  view.setBlockVisible(true); logger.stimulusOnset(); ui.setHint(meta.hint ?? null); game.state = 'waiting';
  // wait for the one click (or the time-out)
  const clicked = await new Promise(res => { game.resolveClick = res; setTimeout(() => res(null), T.maxWaitMs); });
  game.resolveClick = null;
  if (!clicked) { game.state = 'idle'; logger.endTrial('no_click'); view.clearBlock(); return; }
  // launch
  const J = CONFIG.launch.impulse * clicked.strength.multiplier, el = CONFIG.launch.elevationDeg * Math.PI / 180;
  game.state = 'flight'; ui.setHint(null);
  logger.click({ ...clicked, impulse: J, launchSpeed: J / CONFIG.block.mass, direction: { x: 0, y: +Math.sin(el).toFixed(4), z: -(+Math.cos(el).toFixed(4)) } });
  sim.launch(J);
  const tLaunch = performance.now(); let restSince = null;
  await new Promise(res => { game.tick = () => {                                   // called from the frame loop after each physics update
    const now = performance.now(), el2 = now - tLaunch;
    if (sim.atRest && restSince === null) restSince = now;
    if (el2 >= T.observeMaxMs || (el2 >= T.observeMinMs && (sim.fell || (restSince !== null && now - restSince >= T.afterRestMs)))) { game.tick = null; res(); } }; });
  const endedBeforeRest = !sim.atRest && !sim.fell; sim.runToRest();                // finish the physics without drawing, so the logged outcome is always the final resting state
  logger.setOutcome({ ...sim.outcome(), observedMs: performance.now() - tLaunch, endedBeforeRest, clicksIgnoredAfterLaunch: game.extraClicks });
  game.state = 'idle'; logger.endTrial('completed'); view.clearBlock();
}

// ---- input: one click per trial, on the picture face -----------------------------------------------------------------------
$('c').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (game.state === 'flight') { game.extraClicks++; return; }                       // after the click nothing else can be done
  if (game.state !== 'waiting') return;
  const hit = view.pick(e.clientX, e.clientY);
  if (!hit) { logger.ignoredClick({ pointerType: e.pointerType, x: e.clientX, y: e.clientY, reason: 'not_on_block' }); return; }
  if (hit.face !== '+z') { logger.ignoredClick({ pointerType: e.pointerType, x: e.clientX, y: e.clientY, reason: `block_face_${hit.face}` }); return; }
  const strength = hitStrength({ cue: game.cue, familiarity: game.familiarity, u: hit.u, v: hit.v, phase: game.phase });
  game.state = 'launching'; game.resolveClick?.({ pointerType: e.pointerType, x: e.clientX, y: e.clientY, local: hit.local, face: hit.face, u: hit.u, v: hit.v, strength });
});

// ---- main loop ------------------------------------------------------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(now - last, 100) / 1000; last = now;
  if (game.sim && game.state === 'flight') { let n = 0; while (acc >= CONFIG.fixedDt && n < 12) { game.sim.step(); acc -= CONFIG.fixedDt; n++; } if (n === 12) acc = 0; game.tick?.(); } else acc = 0;
  if (game.sim && view.mesh) view.sync(game.sim.body);
  view.render(); requestAnimationFrame(frame);
}

// ---- instructions (with Back / Next) and practice blocks -----------------------------------------------------------------------
async function runPractice(step, hist) {
  const imageId = TUTORIAL_IMAGES.ids[step.image], { info } = hist.present([imageId]);
  await runTrial({ phase: 'tutorial', imageId, image: info[imageId], cue: NEUTRAL_CUE, colorRulePhase: 'initial', hint: step.hint, label: 'Practice', planned: { role: step.role ?? 'novel' } });
}
/** Intro card + tutorial cards, navigable with Next / Back. Back only moves between instruction screens: it never re-runs a practice block, resets progress or touches trial data. */
async function runInstructions() {
  const steps = [INTRO_CARD, ...(SESSION.tutorial ? TUTORIAL_STEPS : [])], hist = new ImageHistory(), done = new Set(); sess.instructionNavigation = []; let i = 0;
  while (i < steps.length) {
    const step = steps[i], action = await ui.showCard(step, { canBack: i > 0 });
    sess.instructionNavigation.push({ card: step.id, action, tSessionMs: logger.sessionMs() });
    if (action === 'back') { i--; continue; }
    if (step.practice && !done.has(i)) { ui.hideScreen(); await runPractice(step, hist); done.add(i); }
    i++;
  }
  ui.hideScreen();
}

// ---- experiment ---------------------------------------------------------------------------------------------------------------
async function runExperiment() {
  const seed = SESSION.seed ?? Math.floor(Math.random() * 2 ** 32), spec = { towers: [{ blocks: [{ size: CONFIG.block.size, pos: CONFIG.block.start, image: true, cue: 'random' }] }] };
  const plan = buildPlan({ ...spec, nTrials: SESSION.nTrials, orderMode: 'sequence', imageIds: IMAGES.ids, novelProportion: SESSION.novelProportion, lagChoices: SESSION.lagChoices,
    cueValues: SESSION.cueValues, cuePolicy: SESSION.cuePolicy, phaseBreakAfter: SESSION.reversalAfterTrial, seed });
  sess.plan = { seed, stats: plan.stats, trials: plan.trials.map(t => ({ trialNumber: t.trialNumber, imageId: t.slots[0].imageId, cue: t.slots[0].cue, role: t.slots[0].role, lagTarget: t.slots[0].lagTarget, fallback: t.slots[0].fallback })) };
  logger.persist();
  const hist = new ImageHistory();
  for (const pt of plan.trials) {
    const s = pt.slots[0], { info } = hist.present([s.imageId]);
    await runTrial({ phase: 'experiment', imageId: s.imageId, image: info[s.imageId], cue: s.cue, colorRulePhase: ruleForTrial(pt.trialNumber, SESSION.reversalAfterTrial), label: `Trial ${pt.trialNumber} / ${plan.trials.length}`, planned: s });
  }
}

async function runSession() {
  await runInstructions(); await runExperiment();
  ui.setTrialInfo(null); ui.setHint(null); view.clearBlock(); sess.completedAt = new Date().toISOString(); logger.persist(); ui.showEnd();
}

// ---- downloads ---------------------------------------------------------------------------------------------------------------------
$('dlJson').onclick = $('endJson').onclick = () => logger.download('json');
$('dlCsv').onclick = $('endCsv').onclick = () => logger.download('csv');
addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') logger.download('json'); });

// ---- test hooks --------------------------------------------------------------------------------------------------------------------
window.__log = logger;
window.__flight = { game, view, CONFIG, SESSION, sess, hitStrength, facePoint: (u, v) => view.screenPointOfFace(u, v) };
requestAnimationFrame(frame);
runSession();
