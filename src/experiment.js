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
/** Phase of trial n (1-based): initial up to and including `reversalAfterTrial`, reversed after it. Practice trials (n = null) are always initial. */
export const ruleForTrial = (n, reversalAfterTrial) => (reversalAfterTrial != null && n != null && n > reversalAfterTrial ? 'reversed' : 'initial');

// ---- familiarity -> optimal vertical position (0 = bottom, 1 = top). The vertical rule never reverses. -------------
export const FAMILIARITY = { novelPreferredY: 0.2, familiarPreferredY: 0.8 };
export const preferredYForFamiliarity = f => (f === 'familiar' ? FAMILIARITY.familiarPreferredY : FAMILIARITY.novelPreferredY);

// ---- hit strength (identical to the tower game's v2.2+ function; the horizontal penalty cut-off and penalty blocks do NOT exist here) ----
//   multiplier = baseline + (peak - baseline) * Gh * Gv,  G(d, w) = exp(-d^2 / (2 w^2))   (d = click - optimum, normalised face units)
//   impulse = CONFIG.launch.impulse * multiplier
export const EFFECT = { baseline: 0.25, peak: 2.2, horizontalWidth: 0.15, verticalWidth: 0.15 };
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
