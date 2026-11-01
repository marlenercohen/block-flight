# Block Flight: MATLAB analysis

Plain MATLAB (R2019b or newer; no toolboxes). Each JSON file = one participant. Works for one session or many.

## Run it
1. In MATLAB, `cd` to the `block_flight` folder (or add `analysis` to the path: `addpath('<path>/block_flight/analysis')`).
2. Run
   ```matlab
   run_blockflight_analysis
   ```
   A file dialog opens: select one or more `blockflight_*.json` files (Cmd/Ctrl-click or Shift-click for several; the "Download data" button on the game's end screen produces them).
   Or skip the dialog: `run_blockflight_analysis({'C:\data\p1.json','C:\data\p2.json'})`, optionally with an output folder as the second argument.
3. Figures (PNG) and `analysis_report.txt` (everything printed in the command window, with sample sizes) go to `analysis/output/<date-time>/`. The function returns a struct with the trial table (`results.T`) for your own analyses.

Settings (smoothing windows, minimum trials, what counts as "early / late", reaction-time limits) are in `bf_params.m`.

## What you get
| Figure | Content |
|---|---|
| 1, 1b | Horizontal (colour) and vertical (familiarity) absolute error vs trial: dots = trials, lines = moving average **within each rule block** (never smoothed across a switch), black = mean of participants, dashed red = colour-rule switches. 1b aligns errors to each switch to show re-learning speed. |
| 2 | Horizontal vs vertical error: raw correlation and correlation after subtracting a moving average within each participant x rule block ("detrended"); per-participant r. |
| 3 | The same correlation in the first vs last third of every rule block that has enough trials (>= 24 clicked trials, >= 8 per segment), raw and with a linear trend removed within the segment. |
| 4 | Reaction time over trials and vs horizontal / vertical error (Spearman, raw and detrended, log RT). |
| 5 | Proportion of clicks in the correct vertical half (novel: below the middle, familiar: above) over trials and by familiarity; horizontal error on correct vs wrong-half trials, raw and detrended. |
| 6 | Horizontal error for novel vs familiar pictures; for familiar pictures by repetition lag (1, 2, 3, 5). |

## How to read it (and what not to over-read)
- **Learning and reversals.** Errors are expected to jump up after each switch, then fall. Learning is therefore judged inside rule blocks; use Fig 1b for relearning.
- **Shared learning vs trade-off.** Both skills may improve together, which produces a positive raw correlation of the two errors without any competition. "Detrended" removes slow trends and leaves trial-to-trial fluctuation: a *negative* detrended correlation (good on one, worse on the other on the same trial) is the signature of competing for attention; a *positive* one means shared lapses. Detrending with a moving average also removes some real fast learning, so check that conclusions do not depend on `detrendWindow`.
- **Recognition is binary.** Fig 5 uses correct vs wrong vertical half (plus the continuous vertical error in Figs 1-2). The competition hypothesis is about novel and familiar pictures alike, so compare the novel-only and familiar-only lines in the report.
- **Small samples.** The report prints n for every statistic and flags participants with < 100 clicked trials. With < 5 participants no group-level test across participants is computed; trial-level p values treat trials as independent (they are not: learning, autocorrelation, repeated pictures), so use them as a rough guide only. Correlations from ~20-trial segments have a 95% interval of about +/-0.45.
- **Lags.** Lags are fixed by the picture schedule, so there are few trials per lag per participant.

## Data columns used (JSON schema `blockflight-log/1`)
Experimental trials with a click: `click.absHorizontalError`, `click.absVerticalError` (distance from the correct edge; in logs from before the edge change it is the distance from 0.2 / 0.8, but the correct-half measure only uses `click.v` and is unaffected), `click.u`, `click.v`, `click.reactionTimeMs`, `image.familiarity`, `image.lagTrials`, `cue`, `colorRulePhase`, `blockNumber`, `trialInBlock`, `switchPoints`, `outcome.distanceAway`. Older logs without `blockNumber` / `switchPoints` are handled by deriving blocks from changes in `colorRulePhase`. Practice trials and trials without a click are counted but excluded.

## Colour parameter
The game now draws the colour parameter `cue` (0 = blue end, 1 = red end) from a continuous uniform distribution on every trial; older logs (including the first pilot) used five set values. The logs contain the actual value (`cue`), the correct horizontal position for that value and mapping (`click.optimalU` = 0.2 + 0.6 c, or 0.8 - 0.6 c in mirrored blocks) and the signed / absolute errors. The analysis uses the logged errors, and the report prints an integrity check that recomputes the correct position from `cue` and the mapping, so both log formats work.

## Test data
`node analysis/synthetic/make_synthetic_session.mjs <folder> 3 200 1` writes simulated sessions (clearly marked synthetic) in the real format, with built-in learning and an attention trade-off, to try the code.
