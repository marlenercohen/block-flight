// Session configuration. Edit here or override per run with URL parameters (see applyUrlOverrides).
import { CUE } from './experiment.js';

export const SESSION = {
  nTrials: 120,                  // number of experimental trials (after the tutorial)
  reversalAfterTrial: 60,        // the colour -> horizontal rule is mirrored for trials AFTER this one (null = never). The familiarity -> vertical rule never changes.
  tutorial: true,
  novelProportion: 0.5,          // share of trials with a first-time picture; the rest are repeats at the lags below
  lagChoices: [1, 2, 3, 5],      // a repeated picture is one that was shown exactly this many trials earlier
  cueValues: CUE.values, cuePolicy: 'balanced',
  seed: null,                    // null = random per session (the seed used is logged)
  // timing (ms)
  timing: {
    blankMs: 450,                // empty platform between trials
    maxWaitMs: 20000,            // no click within this time: the trial is logged as 'no_click' and the next one starts
    observeMinMs: 1400,          // the participant always sees at least this much of the movement after the click
    observeMaxMs: 4500,          // ... and the trial ends at the latest this long after the click (even if a tumbling block is still creeping)
    afterRestMs: 600,            // time to keep looking after the block has come to rest
  },
  kiosk: false,                  // true / ?kiosk=1: hide the data-download buttons from the participant (Ctrl+Shift+D still downloads the JSON)
};

/** URL overrides: ?trials=40&reversal=20 (?reversal=0: never)&seed=7&tutorial=0&novel=0.5&lags=1,2,3,5&kiosk=1&blank=300&observe=2000 */
export function applyUrlOverrides(cfg, search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search); const num = k => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : undefined);
  if (num('trials') !== undefined) cfg.nTrials = num('trials');
  if (q.has('reversal')) cfg.reversalAfterTrial = Number(q.get('reversal')) > 0 ? Number(q.get('reversal')) : null;
  if (num('seed') !== undefined) cfg.seed = num('seed');
  if (q.has('tutorial')) cfg.tutorial = q.get('tutorial') !== '0';
  if (num('novel') !== undefined) cfg.novelProportion = num('novel');
  if (q.has('lags')) cfg.lagChoices = q.get('lags').split(',').map(Number).filter(Number.isFinite);
  if (q.has('kiosk')) cfg.kiosk = q.get('kiosk') !== '0';
  if (num('blank') !== undefined) cfg.timing.blankMs = num('blank');
  if (num('maxWait') !== undefined) cfg.timing.maxWaitMs = num('maxWait');
  if (num('observe') !== undefined) { cfg.timing.observeMinMs = num('observe'); cfg.timing.observeMaxMs = Math.max(cfg.timing.observeMaxMs, num('observe')); }
  if (num('rest') !== undefined) cfg.timing.afterRestMs = num('rest');
  return cfg;
}
