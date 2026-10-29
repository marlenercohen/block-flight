// Full-screen instruction cards and the end screen, plus the small overlays (trial counter, hint). DOM only.
const $ = id => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);
function showScreen(which) { show($('screen'), !!which); show($('card'), which === 'card'); show($('endBox'), which === 'end'); }
export function hideScreen() { showScreen(null); }
/** Instruction card; resolves 'next' or 'back'. `canBack` shows the Back button (not on the first card). */
export function showCard({ title, text, button = 'Continue' }, { canBack = false } = {}) {
  $('cardTitle').textContent = title; $('cardText').textContent = text; $('cardBtn').textContent = button; show($('cardBack'), canBack); showScreen('card');
  return new Promise(res => { const done = v => { $('cardBtn').onclick = null; $('cardBack').onclick = null; res(v); }; $('cardBtn').onclick = () => done('next'); $('cardBack').onclick = () => done('back'); });
}
export function showEnd() { showScreen('end'); }
export const setHint = text => { $('hintBar').textContent = text ?? ''; show($('hintBar'), !!text); };
export const setTrialInfo = text => { $('trialInfo').textContent = text ?? ''; show($('trialInfo'), !!text); };
