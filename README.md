# Block Flight (prototype)

One block per trial, **one click** per block. The block flies away from the camera and the participant watches; the movement is the only feedback. Goal: make every block travel as far as possible.
A separate project from the block-game versions (own directory, repository, deployment, log format, storage keys). It only copies small pieces of their code (rules, image history, plan builder).

## What is being learned
- **Horizontal** click position: optimum depends on the block colour (blue 0.2 ... red 0.8 across the five cues, linear in between). The mapping is mirrored after each configured switch trial (unannounced): default 200 trials, switches after trials 60, 110, 160 = original 1-60, mirrored 61-110, original 111-160, mirrored 161-200 (blocks of 60 / 50 / 50 / 40). Every trial logs `colorRulePhase` (active mapping), `blockNumber` and `trialInBlock`.
- **Vertical** click position (never reverses): novel pictures are best at the bottom edge (v = 0), familiar pictures at the top edge (v = 1), as the instructions say. The reward is broad near the correct edge and falls smoothly toward the middle and the opposite edge: `Gv = exp(-d^2 / (2 * 0.35^2))`, d = distance from the correct edge (0.96 at 0.1 from the edge, 0.85 at 0.2, 0.36 in the middle, 0.02 at the opposite edge).
- Picture identity, familiarity and repetition lags (1, 2, 3, 5 trials) use the same planner as the tower game; every picture appears at most twice (once novel, once familiar). Practice pictures are a separate pool.

## Hit strength and physics
`multiplier = 0.25 + (2.2 - 0.25) * Gh * Gv`; `Gh = exp(-d^2 / (2 * 0.15^2))` with d = click - colour optimum (unchanged from the tower game), `Gv` as above. Multiplicative combination as in the tower game; **no cut-off, no penalty**: every click launches the block.
Impulse = `3.2 x multiplier` (N s, mass 1) applied **through the block's centre of mass**, direction away from the camera raised by 15 degrees, plus a small forward-tumble spin (0.1 x impulse rad/s). Because it acts through the centre of mass, where on the face you click changes the movement only through the multiplier (no torque differences). Sliding friction makes distance roughly proportional to impulse squared: 0.08 m for the weakest click, 1.3 m at multiplier 1, 6.1 m for the optimum (hops, tilts, tips onto its back). The curve is smooth and monotonic (checked in `npm run check`). Faint metre lines on the platform only help judge distance. Constants: `src/config.js`.

## Trial flow and timing (`src/session_config.js`, ms)
blank platform 450 -> block appears (clock starts) -> one click on the picture face (clicks elsewhere are ignored and logged) -> movement shown at least 1400 and at most 4500, until 600 after it stops -> next block. No click within 20 s: logged `no_click`, next trial. Typical trial 2-4 s.
URL options: `?trials=60&switches=20,40` (`switches=` empty or `reversal=0` = never; `reversal=N` = one switch) `&seed=7&tutorial=0&novel=0.5&lags=1,2,3,5&kiosk=1&blank=300&observe=2000&rest=300&maxWait=20000`. Defaults: 200 trials, switches after trials 60, 110, 160.

## Instructions
Intro card, four cards with a practice block each (goal, location matters, new -> bottom, familiar -> top) and a last card (colour is a hint; the way colour helps CAN SWITCH during the game, more than once, without notice; the new / familiar rule does not change). **Back / Next** navigation; Back never repeats a practice block or changes data; moves are logged in `session.instructionNavigation`. The colour mapping and the switch trials are never revealed or announced during play.

## Data (schema `blockflight-log/1`; JSON + trials CSV; local only, nothing is sent anywhere)
Faint "Download data" / "Trials CSV" buttons bottom-right (hidden with `?kiosk=1`; Ctrl+Shift+D downloads the JSON) and on the end screen. Per trial: trial number and timing (stimulus onset, reaction time), image id / familiarity / presentation number / previous trial / lag / intervening images, cue and colour, colour-rule phase, optimal u and v, click u, v and screen position, signed and absolute horizontal and vertical errors, Gh, Gv, multiplier, impulse and launch speed, ignored clicks, and the physical outcome (displacement vector and length, distance away, net rotation and rotation path, peak height, path length, airborne time, time to rest, left platform, final pose). Session: seed, per-trial plan, all rule and physics parameters, device info.
Analysis: `horizontalError` (signed) vs trial for colour-rule learning and relearning after the reversal; `verticalError` by `familiarity`; their interaction via `multiplier` and the outcome columns.

## Run, test, deploy
`npm install`, `npm run dev` (http://localhost:5175), `npm run check` (headless rules / physics / plan / instructions checks), `node tools/browser/flight_test.mjs` (needs `puppeteer-core` and Chrome; plays the instructions, practice blocks and an 8-trial session and checks the exported data), `npm run build` (base `/block-flight/`).
Deployment: repository `marlenercohen/block-flight`, GitHub Pages source "GitHub Actions" (`.github/workflows/deploy.yml`), site https://marlenercohen.github.io/block-flight/ . Images: THINGSplus CC0 set (https://osf.io/jum2f), 240 experimental + 10 practice.
