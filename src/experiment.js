// Block Flight experiment rules (colour -> horizontal optimum with an unannounced reversal, familiarity -> vertical optimum, continuous hit-strength function). No DOM.
import IMAGE_IDS from './image_ids.js';

// ---- colour cue (blue -> purple -> red); cue c in [0, 1] -----------------------------------------------------
export const CUE = {
  values: [0, 0.25, 0.5, 0.75, 1],
  colorStops: [{ cue: 0.0, color: 0x2f7fe0 }, { cue: 0.5, color: 0x8c5fb4 }, { cue: 1.0, color: 0xd93a2f }],
  // optimal horizontal click position (0 = left edge of the picture face, 1 = right edge) by cue, linear in between: blue 0.2 ... red 0.8
  preferredXStops: [{ cue: 0.0, x: 0.2 }, { cue: 1.0, x: 0.8 }],
};
const lerp = (a, b, t) => a + (b - a) * t;
const interp = (stops, key, val) => {
  const x = Math.min(stops.at(-1)[key], Math.max(stops[0][key], val));
  for (let i = 0; i < stops.length - 1; i++) if (x >= stops[i][key] && x <= stops[i + 1][key]) return [stops[i], stops[i + 1], (x - stops[i][key]) / (stops[i + 1][key] - stops[i][key])];
  return [stops.at(-1), stops.at(-1), 0];
};
export function colorForCue(c) {
  const [a, b, t] = interp(CUE.colorStops, 'cue', c); const ch = k => Math.round(lerp((a.color >> k) & 255, (b.color >> k) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** Colour rule phase: 'initial' = mapping above; 'reversed' = mirrored (blue 0.8 ... red 0.2). */
export function preferredXForCue(c, phase = 'initial') { const [a, b, t] = interp(CUE.preferredXStops, 'cue', c); const x = lerp(a.x, b.x, t); return phase === 'reversed' ? 1 - x : x; }
/** Switch points = trial numbers AFTER which the colour mapping flips (e.g. [50, 100, 150]: trials 1-50 original, 51-100 reversed, 101-150 original, 151-200 reversed). Accepts a number, an array or null.
 *  Returns the colour-rule phase of experimental trial n (1-based): 'initial' or 'reversed'. Practice trials (n = null) are always 'initial'. */
const switchList = sp => [].concat(sp ?? []).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
export const blockForTrial = (n, switchPoints) => (n == null ? 0 : 1 + switchList(switchPoints).filter(p => n > p).length);   // 1-based block number (0 for practice trials)
export const ruleForTrial = (n, switchPoints) => (n != null && (blockForTrial(n, switchPoints) - 1) % 2 === 1 ? 'reversed' : 'initial');
export const trialInBlock = (n, switchPoints) => { const sp = switchList(switchPoints).filter(p => n > p); return n - (sp.length ? sp.at(-1) : 0); };

// ---- familiarity -> optimal vertical position (0 = bottom edge, 1 = top edge). The vertical rule never reverses. ---------------
// Novel pictures: the bottom edge is best; familiar pictures: the top edge is best (this is what the instructions say). Familiarity is a binary judgement, so the reward is broad near the correct
// edge and falls smoothly toward the middle and the opposite edge: Gv = exp(-d^2 / (2 s^2)), d = distance from the correct edge, s = EFFECT.verticalWidth.
export const FAMILIARITY = { novelPreferredY: 0, familiarPreferredY: 1 };
export const preferredYForFamiliarity = f => (f === 'familiar' ? FAMILIARITY.familiarPreferredY : FAMILIARITY.novelPreferredY);

// ---- hit strength: the tower game's multiplicative form; no horizontal cut-off, no penalty blocks ----
//   multiplier = baseline + (peak - baseline) * Gh * Gv,  G(d, w) = exp(-d^2 / (2 w^2))   (d = click - optimum, normalised face units)
//   horizontal: w = 0.15 around the colour-dependent optimum (unchanged from the tower game);  vertical: w = 0.35 around the correct edge (broad, see above)
//   impulse = CONFIG.launch.impulse * multiplier
export const EFFECT = { baseline: 0.25, peak: 2.2, horizontalWidth: 0.15, verticalWidth: 0.35 };
export const bump = (d, width) => Math.exp(-(d * d) / (2 * width * width));

/** u = horizontal position on the picture face (0 left .. 1 right), v = vertical (0 bottom .. 1 top). Returns every component needed for logging. */
export function hitStrength({ cue, familiarity, u, v, phase = 'initial' }) {
  const optimalU = preferredXForCue(cue, phase), optimalV = preferredYForFamiliarity(familiarity);
  const eU = u - optimalU, eV = v - optimalV, gH = bump(eU, EFFECT.horizontalWidth), gV = bump(eV, EFFECT.verticalWidth);
  return { optimalU, optimalV, horizontalError: eU, verticalError: eV, gH, gV, multiplier: EFFECT.baseline + (EFFECT.peak - EFFECT.baseline) * gH * gV };
}

// ---- images --------------------------------------------------------------------------------------------------
export const IMAGES = { ids: IMAGE_IDS, dir: 'images', faceFraction: 0.72 };      // the picture fills this fraction of the block face; the rest is the colour cue
export const TUTORIAL_IMAGES = { ids: ['cc0_apple', 'cc0_scissors', 'cc0_tennis_ball', 'cc0_lime', 'cc0_anchor', 'cc0_balloon', 'cc0_candy_cane', 'cc0_clothespin', 'cc0_dreidel', 'cc0_cracker'], dir: 'images_tutorial' };
export const NEUTRAL_CUE = 0.5;
