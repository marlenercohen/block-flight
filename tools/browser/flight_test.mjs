// End-to-end browser test of Block Flight. Needs puppeteer-core, Chrome and `npm run dev` on 5175 (or URL=...). Run: node tools/browser/flight_test.mjs
// Plays the instructions (Back / Next), 4 practice blocks and an 8-trial session (colour rule switching after trials 2, 4 and 6) with scripted good / poor / double / off-block clicks and one missed trial,
// then checks the exported JSON and CSV against the rules and the hit-strength function.
import puppeteer from 'puppeteer-core';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { hitStrength } from '../../src/experiment.js';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', BASE = process.env.URL ?? 'http://localhost:5175/';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'flight_'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await p.goto(`${BASE}?trials=8&switches=2,4,6&seed=11&blank=150&observe=1500&rest=200&maxWait=3500`, { waitUntil: 'domcontentloaded' }); await sleep(1500);
const ev = f => p.evaluate(f);
const vis = sel => ev(`(()=>{const e=document.querySelector('${sel}'); if(!e) return false; const r=e.getBoundingClientRect(); return !e.classList.contains('hidden') && getComputedStyle(e).display!=='none' && r.width>0 && r.height>0})()`);
const waitFor = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(30); } return false; };
const cardTitle = () => ev(() => document.getElementById('cardTitle').textContent);
const state = () => ev(() => window.__flight.game.state);
const next = async () => { await p.click('#cardBtn'); await sleep(200); }, back = async () => { await p.click('#cardBack'); await sleep(200); };
const waitBlock = () => waitFor(async () => (await state()) === 'waiting', 8000);
const clickFace = async (u, v) => { const q = await ev(`window.__flight.facePoint(${u},${v})`); await p.mouse.click(q.x, q.y); };
const optimum = () => ev(() => window.__log.active.optimal);
const clamp = x => Math.min(0.97, Math.max(0.03, x));
const ntr = () => ev(() => window.__log.data.trials.length);
// ---- instructions ----
await waitFor(() => vis('#card'), 30000);   // images + physics engine load first (slower on the production build)
ok(await vis('#card') && (await cardTitle()) === 'Block Flight' && !(await vis('#cardBack')), 'intro card first, no Back button');
await next(); ok((await cardTitle()) === 'Welcome!' && await vis('#cardBack'), 'Welcome card has Back');
await back(); ok((await cardTitle()) === 'Block Flight', 'Back returns to the intro'); await next(); await next();
ok(await waitBlock(), 'practice block 1 appears and waits for the click');
ok(!(await ev(() => /\d+\.\d|score|correct|wrong|strength/i.test(document.body.innerText.replace(/Trial \d+ \/ \d+/, '')))), 'no numbers, scores or correctness indicators on screen');
const o1 = await optimum(); await clickFace(0.5, 0.5);
await waitFor(() => vis('#card'), 15000); ok((await cardTitle()) === 'Where you click matters' && (await ntr()) === 1, 'after the practice block the next card appears (1 practice trial logged)');
await back(); ok((await cardTitle()) === 'Welcome!' && (await state()) === 'idle' && (await ntr()) === 1, 'Back shows the previous card without starting a block'); await next();
ok((await cardTitle()) === 'Where you click matters' && (await ntr()) === 1, 'forward again skips the finished practice block'); await next();
for (let k = 2; k <= 4; k++) { ok(await waitBlock(), `practice block ${k} appears`); await clickFace(k === 3 ? 0.5 : 0.5, k === 3 ? 0.2 : k === 4 ? 0.8 : 0.35); await waitFor(() => vis('#card'), 15000); if (k < 4) await next(); }
ok((await cardTitle()) === 'One more hint' && (await ntr()) === 4 && (await ev(() => document.getElementById('cardBtn').textContent)) === 'Begin', 'last card (Begin) after four practice blocks');
await back(); await back(); ok((await cardTitle()) === 'New pictures', 'two Backs from the last card'); await next(); await next(); ok((await cardTitle()) === 'One more hint' && (await ntr()) === 4, 'two Nexts return without repeating a practice block');
await next();
// ---- experimental trials ----
const t0 = Date.now(); const planned = [];
for (let t = 1; t <= 8; t++) {
  ok(await waitBlock(), `trial ${t}: block appears`); const opt = await optimum(), info = await ev(() => ({ n: window.__log.active.trialNumber, ph: window.__log.active.colorRulePhase }));
  let u = clamp(opt.u), v = clamp(opt.v);
  if (t === 2) u = clamp(opt.u + 0.15); if (t === 3) v = clamp(opt.v === 0 ? 0.5 : 0.5); if (t === 6) u = clamp(1 - opt.u); if (t === 7) { u = 0.05; v = 0.95; }
  if (t === 8) { planned.push('no_click'); await waitFor(async () => (await ev(() => window.__log.data.trials.at(-1).result)) === 'no_click', 8000); continue; }
  if (t === 3) { await p.mouse.click(60, 400); await sleep(100); }            // off the block: ignored, the trial goes on
  await clickFace(u, v); await sleep(120);
  if (t === 2) { await clickFace(0.5, 0.5); await sleep(100); }              // a second click during the flight must do nothing
  await waitFor(async () => (await ev(() => window.__log.data.trials.at(-1).result)) !== null || (await ev(() => window.__log.data.trials.length)) > 4 + t, 15000); planned.push(info.ph);
}
ok(await waitFor(() => vis('#endBox'), 20000), 'end screen reached'); const wall = (Date.now() - t0) / 1000;
await p.click('#endJson'); await sleep(600); await p.click('#endCsv'); await sleep(800);
const jf = fs.readdirSync(DL).find(f => f.endsWith('.json')), cf = fs.readdirSync(DL).find(f => f.endsWith('_trials.csv'));
ok(jf && cf, 'JSON and CSV downloads'); const J = JSON.parse(fs.readFileSync(path.join(DL, jf), 'utf8')), E = J.trials.filter(t => t.phase === 'experiment'), T = J.trials.filter(t => t.phase === 'tutorial');
ok(T.length === 4 && E.length === 8 && E.every((t, i) => t.trialNumber === i + 1), 'exported: 4 practice trials and 8 experimental trials numbered 1-8');
ok(E.map(t => t.colorRulePhase[0]).join('') === 'iirriirr' && E.map(t => t.blockNumber).join('') === '11223344' && E.map(t => t.trialInBlock).join('') === '12121212' && E.every(t => t.switchPoints.join() === '2,4,6'), `colour mapping per trial: ${E.map(t => t.colorRulePhase[0]).join('')} (i = original, r = mirrored), block numbers ${E.map(t => t.blockNumber).join('')}: switches after trials 2, 4, 6`);
ok(J.session.experimentConfig.colorRule.switchPoints.join() === '2,4,6' && J.session.experimentConfig.colorRule.blocks.map(b => `${b.block}:${b.firstTrial}-${b.lastTrial}:${b.mapping[0]}`).join(' ') === '1:1-2:i 2:3-4:r 3:5-6:i 4:7-8:r' && T.every(t => t.blockNumber === 0 && t.colorRulePhase === 'initial'), 'session config lists the blocks and mappings; practice trials are block 0, original mapping');
const C = E.filter(t => t.click); ok(C.length === 7 && E[7].result === 'no_click' && E[7].click === null && E.slice(0, 7).every(t => t.result === 'completed'), 'seven clicked trials and one timed-out trial (no_click) logged');
let bad = 0; for (const t of C) { const c = t.click, s = hitStrength({ cue: t.cue, familiarity: t.image.familiarity, u: c.u, v: c.v, phase: t.colorRulePhase });
  if (Math.abs(s.multiplier - c.multiplier) > 2e-4 || Math.abs(s.optimalU - c.optimalU) > 2e-4 || Math.abs(s.optimalV - c.optimalV) > 2e-4 || Math.abs(c.horizontalError - (c.u - c.optimalU)) > 3e-4 || Math.abs(c.verticalError - (c.v - c.optimalV)) > 3e-4 || Math.abs(c.impulse - 3.2 * c.multiplier) > 2e-3 || Math.abs(c.absHorizontalError - Math.abs(c.horizontalError)) > 1e-4 || Math.abs(t.optimal.u - c.optimalU) > 1e-4) bad++; }
ok(bad === 0, 'every click: multiplier, optimum (current colour phase + familiarity), signed / absolute errors and impulse (3.2 x multiplier) are reproduced from the logged click position');
ok(C.every(t => t.outcome && ['dx', 'dy', 'dz', 'displacement', 'distanceAway', 'netRotationDeg', 'rotationPathDeg', 'peakHeight', 'pathLength', 'airborneS', 'timeToRestS', 'leftPlatform', 'finalPosition', 'finalQuaternion'].every(k => k in t.outcome)), 'every clicked trial has the physical outcome (displacement, rotation, height, path, time to rest ...)');
const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; }, rho = (x, y) => { const rx = rank(x), ry = rank(y), n = x.length, m = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - m) * (ry[i] - m); sxx += (rx[i] - m) ** 2; syy += (ry[i] - m) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const rr = rho(C.map(t => t.click.multiplier), C.map(t => t.outcome.distanceAway)); ok(rr > 0.9, `distance travelled follows the hit strength (Spearman rho ${rr.toFixed(2)} across ${C.length} trials: multipliers ${C.map(t => t.click.multiplier.toFixed(2)).join(', ')} -> distances ${C.map(t => t.outcome.distanceAway.toFixed(2)).join(', ')} m)`);
ok(E[1].outcome.clicksIgnoredAfterLaunch >= 1 && Math.abs(E[1].click.impulse - 3.2 * E[1].click.multiplier) < 2e-3 && E[2].ignoredClicks.length === 1 && E[2].ignoredClicks[0].reason === 'not_on_block' && E[2].click.ignoredClicksBefore === 1, 'one click only: a second click during the flight was ignored (and counted), an off-block click did not use up the trial');
ok(C.filter(t => t.colorRulePhase === 'reversed').every(t => Math.abs(t.click.optimalU - (0.8 - 0.6 * t.cue)) < 1e-3) && C.filter(t => t.colorRulePhase === 'initial').every(t => Math.abs(t.click.optimalU - (0.2 + 0.6 * t.cue)) < 1e-3) && C.some(t => t.blockNumber === 3), 'optimal horizontal position follows the colour cue in blocks 1 and 3 and is mirrored in blocks 2 and 4 (all switches take effect)');
ok(C.every(t => t.click.optimalV === (t.image.familiarity === 'familiar' ? 1 : 0) && t.optimal.v === t.click.optimalV), 'vertical optimum is the top edge (1) for familiar and the bottom edge (0) for novel pictures in every block');
const imgs = {}; for (const t of E) (imgs[t.image.imageId] ??= []).push(t); ok(Object.values(imgs).every(a => a.length <= 2 && a[0].image.familiarity === 'novel' && (a.length === 1 || (a[1].image.familiarity === 'familiar' && a[1].image.previousTrial === a[0].trialNumber && a[1].image.lagTrials === a[1].trialNumber - a[0].trialNumber))), 'image identity, familiarity, presentation number, previous trial and lag are logged consistently');
ok(E.every(t => t.optimal && typeof t.cue === 'number' && /^#[0-9a-f]{6}$/.test(t.colorHex) && t.stimulusOnsetSessionMs > 0) && C.every(t => t.click.reactionTimeMs > 0 && t.click.screen && t.click.local), 'timing, cue, colour, optimum and click position present on every trial');
const nav = J.session.instructionNavigation; ok(nav.length >= 12 && nav.filter(x => x.action === 'back').length === 4, `instruction navigation logged (${nav.length} moves, ${nav.filter(x => x.action === 'back').length} Back)`);
const csv = fs.readFileSync(path.join(DL, cf), 'utf8').split('\n'), h = csv[0].split(','); ok(['trialNumber', 'colorRulePhase', 'imageId', 'familiarity', 'optimalU', 'optimalV', 'clickU', 'clickV', 'horizontalError', 'verticalError', 'multiplier', 'impulse', 'displacement', 'netRotationDeg', 'rotationPathDeg'].every(c => h.includes(c)) && csv.length === 13, 'trials CSV has one row per trial with the analysis columns');
const dur = E.slice(0, 7).map(t => t.durationMs / 1000); ok(Math.max(...dur) < 8, `trials are quick (clicked trials took ${Math.min(...dur).toFixed(1)}-${Math.max(...dur).toFixed(1)} s from block appearance to the next block; whole 8-trial block ${wall.toFixed(0)} s incl. a ${3.5} s time-out)`);
ok(!(await vis('#cardBack')), 'no Back button on the end screen'); ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); console.log(fails ? `${fails} FAILED` : 'all passed');
