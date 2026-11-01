function results = run_blockflight_analysis(files, outDir)
% RUN_BLOCKFLIGHT_ANALYSIS  Analyse one or more Block Flight JSON logs (schema blockflight-log/1).
%   run_blockflight_analysis                 opens a file dialog: select one or more .json files (hold Ctrl / Cmd or Shift to select several)
%   run_blockflight_analysis(files)          files = cell array of paths (or a single path)
%   run_blockflight_analysis(files, outDir)  also choose the folder for the figures (PNG) and the text report (default: analysis/output/<date-time>)
% Each file is one participant. Needs base MATLAB only (R2019b or newer, for tiledlayout / xline); no toolboxes.
%
% What it does (figure numbers are the same as the list in README_analysis.md):
%   1 learning curves (horizontal / colour error and vertical / familiarity error vs trial, colour-rule switches marked) + errors aligned to each switch
%   2 horizontal vs vertical error: raw correlation and correlation after removing slow trends within each rule block
%   3 early vs late within each rule block (where enough trials exist)
%   4 reaction times over trials and their relation to the two errors
%   5 recognition: proportion of clicks in the correct vertical half over trials; colour errors on correct vs incorrect recognition trials
%   6 secondary: colour errors for novel vs familiar pictures, and for familiar pictures by repetition lag
% Everything printed here is also written to analysis_report.txt. Settings are in bf_params.m.
P = bf_params();
if nargin < 1 || isempty(files)
    [f, d] = uigetfile('*.json', 'Select one or more Block Flight JSON files', 'MultiSelect', 'on');
    if isequal(f, 0), disp('No file selected.'); results = []; return; end
    if ischar(f), f = {f}; end
    files = fullfile(d, f);
end
if ischar(files) || isstring(files), files = cellstr(files); end
if nargin < 2 || isempty(outDir), outDir = fullfile(fileparts(mfilename('fullpath')), 'output', datestr(now, 'yyyymmdd_HHMMSS')); end %#ok<TNOW1,DATST>
if ~exist(outDir, 'dir'), mkdir(outDir); end
fid = fopen(fullfile(outDir, 'analysis_report.txt'), 'w'); cleaner = onCleanup(@() fclose(fid));
say = @(varargin) bf_say(fid, varargin{:});

[T, info] = bf_load_sessions(files);
K = numel(info); cols = lines(max(K, 1));
say('BLOCK FLIGHT ANALYSIS  (%s)\n', datestr(now)); %#ok<TNOW1,DATST>
say('Files: %d (one participant each).  Output folder: %s\n\n', K, outDir);
for k = 1:K
    say('  P%d  session %s: %d experimental trials, %d with a click (%d without), %d practice; colour-rule switches after trials %s\n', k, info(k).sessionId, info(k).nExperimental, info(k).nClicked, info(k).nNoClick, info(k).nPractice, mat2str(info(k).switchPoints));
    if info(k).nClicked < P.minTrialsCaution, say('      CAUTION: only %d clicked trials. Treat everything for this participant as descriptive.\n', info(k).nClicked); end
end
if K < P.minParticipantsForGroupStats, say('\nCAUTION: %d participant(s). Group-level tests across participants are not computed (need >= %d); trial-level tests treat trials as independent although they are not (learning, autocorrelation), so p values are only a rough guide.\n', K, P.minParticipantsForGroupStats); end
say('\nDefinitions: horizontal error = |click - colour optimum| on the picture face (0..1); vertical error = distance of the click from the correct edge (novel -> bottom edge, familiar -> top edge), 0..1;\n  correct vertical half = click above the middle for familiar pictures / below the middle for novel pictures; "detrended" = minus a %d-trial moving average within each participant and rule block (removes learning and fatigue,\n  leaving trial-to-trial fluctuations).\n', P.detrendWindow);
if isempty(T), say('No clicked experimental trials found.\n'); results = struct('T', T, 'info', info); return; end
% data-integrity check: the logged errors and correct positions must agree with the logged colour parameter and click position (the colour parameter can be continuous)
expU = 0.2 + 0.6 * T.cue; expU(T.rule == 1) = 0.8 - 0.6 * T.cue(T.rule == 1);
say('\nIntegrity check: colour parameter %s (%d distinct values in %d trials, range %.3f-%.3f); max |logged correct position - expected from colour and mapping| = %.1e; max |logged horizontal error - (click - correct position)| = %.1e; max |absH - |horizontal error|| = %.1e.\n', ifelse(numel(unique(round(T.cue, 4))) > max(5, 0.8 * height(T)), 'is continuous', 'takes few distinct values (older logs use five set colours)'), numel(unique(round(T.cue, 4))), height(T), min(T.cue), max(T.cue), max(abs(T.optimalU - expU)), max(abs(T.signedH - (T.u - T.optimalU))), max(abs(T.absH - abs(T.signedH))));
if max(abs(T.optimalU - expU)) > 1e-3 || max(abs(T.signedH - (T.u - T.optimalU))) > 1e-3, say('  WARNING: the logged correct positions do not follow 0.2 + 0.6 c (original) / 0.8 - 0.6 c (mirrored): check the version of the game that produced these files before trusting the errors.\n'); end

% ---- derived columns -----------------------------------------------------------------------------------------------------------------------------------
rt = T.rtMs; rt(rt < P.rtMinMs | rt > P.rtMaxMs) = NaN; T.logRT = log(rt);
T.smH = bf_smooth(T, 'absH', P.smoothWindow); T.smV = bf_smooth(T, 'absV', P.smoothWindow);
T.dtH = bf_detrend(T, 'absH', P.detrendWindow); T.dtV = bf_detrend(T, 'absV', P.detrendWindow); T.dtRT = bf_detrend(T, 'logRT', P.detrendWindow);
sw = bf_switches(info); nTrials = max(T.trial);
say('\nTotal: %d clicked trials, %d participants, trials 1-%d, %d rule block(s).\n', height(T), K, nTrials, numel(unique(T.block)));
results.T = T; results.info = info; results.outDir = outDir;

% ======================================================= 1. learning curves ======================================================================================
fig = newfig('Fig 1  Learning curves', [100 100 1100 750]); tl = tiledlayout(2, 1, 'TileSpacing', 'compact'); title(tl, 'Errors over trials (dots = trials, lines = moving average within each rule block, black = mean of participants)');
vars = {'absH', 'smH', 'Horizontal (colour) error'; 'absV', 'smV', 'Vertical (familiarity) error'};
for a = 1:2
    ax = nexttile; hold(ax, 'on');
    for k = 1:K, m = T.participant == k; scatter(T.trial(m), T.(vars{a,1})(m), 12, cols(k,:), 'filled', 'MarkerFaceAlpha', 0.25); end
    for k = 1:K, m = T.participant == k; plot(T.trial(m), T.(vars{a,2})(m), '-', 'Color', cols(k,:), 'LineWidth', 1.5 + (K == 1)); end
    if K > 1, g = groupmean(T, vars{a,2}); plot(g(:,1), g(:,2), 'k-', 'LineWidth', 2.5); end
    drawswitches(ax, sw); ylabel(vars{a,3}); ylim([0 1]); xlim([0 nTrials + 1]); grid(ax, 'on');
    if a == 1, legendP(K); end
end
xlabel('Trial number'); savefig(fig, outDir, 'fig1_learning_curves', P);
fig = newfig('Fig 1b  Errors aligned to the colour-rule switches', [100 100 1100 500]); tl = tiledlayout(1, 2, 'TileSpacing', 'compact'); title(tl, sprintf('Errors around each switch (0 = last trial before the switch; mean over participants, %d pre / %d post trials)', P.alignPre, P.alignPost));
swAll = unique(cell2mat(arrayfun(@(i) info(i).switchPoints(:)', 1:K, 'UniformOutput', false))); sc = lines(max(numel(swAll), 1));
for a = 1:2
    ax = nexttile; hold(ax, 'on'); leg = {};
    for s = 1:numel(swAll)
        rel = -P.alignPre + 1 : P.alignPost; M = nan(K, numel(rel));
        for k = 1:K
            for j = 1:numel(rel), tr = swAll(s) + rel(j); m = T.participant == k & T.trial == tr; if any(m), M(k, j) = T.(vars{a,1})(find(m, 1)); end, end
        end
        mu = mean(M, 1, 'omitnan'); plot(rel, movmean(mu, 3, 'omitnan'), '-', 'Color', sc(s,:), 'LineWidth', 1.8); leg{end+1} = sprintf('switch after trial %d (n = %d)', swAll(s), sum(any(~isnan(M), 2))); %#ok<AGROW>
    end
    xline(0.5, 'k--'); ylabel(vars{a,3}); xlabel('Trials relative to the switch'); ylim([0 1]); grid(ax, 'on'); if a == 1, legend(leg, 'Location', 'northeast', 'Box', 'off'); end
end
savefig(fig, outDir, 'fig1b_aligned_to_switches', P);
say('\n--- 1. Learning curves ---------------------------------------------------------------------------------------------------\n');
for b = unique(T.block)'
    m = T.block == b; say('  block %d (trials %d-%d, %s mapping): n = %d clicked trials (all participants); mean horizontal error first third of the block %.3f -> last third %.3f; vertical error %.3f -> %.3f\n', b, min(T.trial(m)), max(T.trial(m)), ifelse(mean(T.rule(m)) > 0.5, 'mirrored', 'original'), nnz(m), segmean(T, m, 'absH', 1), segmean(T, m, 'absH', 3), segmean(T, m, 'absV', 1), segmean(T, m, 'absV', 3));
end
say('  (Learning is judged within rule blocks: an error that rises right after a switch is expected, not forgetting. Look at Fig 1b for the speed of re-learning.)\n');

% ======================================================= 2. error relationship ===================================================================================
say('\n--- 2. Horizontal vs vertical error ------------------------------------------------------------------------------------------\n');
raw = groupcorr(T, 'absH', 'absV'); dt = groupcorr(T, 'dtH', 'dtV');
fig = newfig('Fig 2  Horizontal vs vertical error', [100 100 1300 480]); tl = tiledlayout(1, 3, 'TileSpacing', 'compact'); title(tl, 'Do colour accuracy and familiarity accuracy trade off?');
panel(nexttile, T, 'absV', 'absH', cols, K, raw, 'Raw errors (includes shared learning trends)', 'Vertical error', 'Horizontal error');
panel(nexttile, T, 'dtV', 'dtH', cols, K, dt, sprintf('Detrended (minus %d-trial moving average)', P.detrendWindow), 'Vertical error residual', 'Horizontal error residual');
ax = nexttile; hold(ax, 'on'); bar(1:2, [mean(raw.perR, 'omitnan') mean(dt.perR, 'omitnan')], 0.5, 'FaceColor', [0.8 0.8 0.8]);
for k = 1:K, plot(1:2, [raw.perR(k) dt.perR(k)], 'o-', 'Color', cols(k,:), 'LineWidth', 1.2); end
set(ax, 'XTick', 1:2, 'XTickLabel', {'raw', 'detrended'}); ylabel('Pearson r per participant'); yline(0, 'k:'); title('Per participant'); grid(ax, 'on');
savefig(fig, outDir, 'fig2_error_relationship', P);
reportcorr(say, 'Raw', raw, K, P); reportcorr(say, 'Detrended', dt, K, P);
say('  Reading: a positive raw r with a ~0 detrended r means both errors fall together as the person learns (shared learning). A detrended r that stays positive means trials with a bad vertical (familiarity) response also had a bad colour response (shared attention lapses); a negative detrended r would mean a trade-off (better on one when worse on the other), which is the competition prediction.\n');

% ======================================================= 3. early vs late within rule blocks ============================================================================
say('\n--- 3. Early vs late within each rule block ----------------------------------------------------------------------------------\n');
E = earlylate(T, P);
fig = newfig('Fig 3  Error correlation early vs late in each rule block', [100 100 1100 480]); tl = tiledlayout(1, 2, 'TileSpacing', 'compact'); title(tl, sprintf('Horizontal-vs-vertical error correlation: first vs last %.0f%% of each rule block', 100 * P.earlyLateFrac));
for a = 1:2
    ax = nexttile; hold(ax, 'on'); if a == 1, fe = 'rEarly'; fl = 'rLate'; ti = 'Raw within segment'; else, fe = 'rEarlyDT'; fl = 'rLateDT'; ti = 'Linear trend removed within segment'; end
    for i = 1:height(E), plot([1 2], [E.(fe)(i) E.(fl)(i)], 'o-', 'Color', cols(E.participant(i), :), 'LineWidth', 1, 'MarkerSize', 5); end
    if height(E) > 0, plot([1 2], [mean(E.(fe), 'omitnan') mean(E.(fl), 'omitnan')], 'ks-', 'LineWidth', 3, 'MarkerFaceColor', 'k'); end
    yline(0, 'k:'); xlim([0.5 2.5]); ylim([-1 1]); set(ax, 'XTick', 1:2, 'XTickLabel', {'early', 'late'}); ylabel('Pearson r (horizontal vs vertical error)'); title(ti); grid(ax, 'on');
end
savefig(fig, outDir, 'fig3_early_vs_late', P);
say('  Rule blocks with >= %d clicked trials and segments of >= %d trials: %d participant-block pairs (of %d participants x %d blocks).\n', P.minBlockTrials, P.minSegmentTrials, height(E), K, numel(unique(T.block)));
if height(E) == 0, say('  Not enough trials per block for an early/late comparison.\n'); else
    for a = 1:2
        if a == 1, fe = 'rEarly'; fl = 'rLate'; lab = 'raw'; else, fe = 'rEarlyDT'; fl = 'rLateDT'; lab = 'linear-detrended'; end
        d = E.(fl) - E.(fe); R = bf_stats('ttest1', d);
        say('  %-16s: mean r early %+.2f, late %+.2f, late - early %+.2f (n = %d pairs; each segment has %d-%d trials)', lab, mean(E.(fe), 'omitnan'), mean(E.(fl), 'omitnan'), R.mean, R.n, min([E.nEarly; E.nLate]), max([E.nEarly; E.nLate]));
        if R.n >= 3, say('; paired t(%d) = %.2f, p = %.3f (pairs from the same participant are not independent)', R.n - 1, R.t, R.p); end, say('\n');
    end
    say('  CAUTION: a correlation from <= 20 trials has a 95%% interval of roughly +/-0.45, so single early/late differences are not interpretable; look at the direction across participants and blocks.\n');
end

% ======================================================= 4. reaction times ============================================================================================
say('\n--- 4. Reaction times --------------------------------------------------------------------------------------------------------\n');
okRT = ~isnan(T.rtMs) & T.rtMs >= P.rtMinMs & T.rtMs <= P.rtMaxMs;
fig = newfig('Fig 4  Reaction times', [100 100 1300 480]); tl = tiledlayout(1, 3, 'TileSpacing', 'compact'); title(tl, 'Reaction time (block appears -> click)');
ax = nexttile; hold(ax, 'on'); T.rtS = rt / 1000; T.smRT = bf_smooth(T, 'rtS', P.smoothWindow);
for k = 1:K, m = T.participant == k & okRT; scatter(T.trial(m), T.rtS(m), 12, cols(k,:), 'filled', 'MarkerFaceAlpha', 0.25); plot(T.trial(m), T.smRT(m), '-', 'Color', cols(k,:), 'LineWidth', 1.5); end
drawswitches(ax, sw); set(ax, 'YScale', 'log'); xlabel('Trial'); ylabel('Reaction time (s, log axis)'); grid(ax, 'on'); xlim([0 nTrials + 1]);
rH = groupcorr(T, 'logRT', 'absH', true); rV = groupcorr(T, 'logRT', 'absV', true); dH = groupcorr(T, 'dtRT', 'dtH', true); dV = groupcorr(T, 'dtRT', 'dtV', true);
panel(nexttile, T, 'absH', 'logRT', cols, K, rH, 'RT vs horizontal error', 'Horizontal error', 'log reaction time');
panel(nexttile, T, 'absV', 'logRT', cols, K, rV, 'RT vs vertical error', 'Vertical error', 'log reaction time');
savefig(fig, outDir, 'fig4_reaction_times', P);
say('  %d of %d trials have a usable reaction time (%d-%d ms); medians per participant (ms): %s\n', nnz(okRT), height(T), P.rtMinMs, P.rtMaxMs, mat2str(round(arrayfun(@(k) median(T.rtMs(T.participant == k & okRT)), 1:K))));
say('  Relation to errors (Spearman rho on log RT, pooled over participants after z-scoring within participant):\n');
reportcorr(say, 'RT vs horizontal error, raw', rH, K, P, true); reportcorr(say, 'RT vs vertical error, raw', rV, K, P, true);
reportcorr(say, 'RT vs horizontal error, detrended', dH, K, P, true); reportcorr(say, 'RT vs vertical error, detrended', dV, K, P, true);
say('  Reading: if slower responses go with smaller errors (negative rho) people trade speed for accuracy; positive rho means long RTs on trials where the person was unsure.\n');

% ======================================================= 5. recognition ================================================================================================
say('\n--- 5. Recognition (click in the correct vertical half) ----------------------------------------------------------------------\n');
T.smC = bf_smooth(T, 'correctHalf', P.smoothWindow); okC = ~isnan(T.correctHalf);
fig = newfig('Fig 5  Recognition performance', [100 100 1300 800]); tl = tiledlayout(2, 3, 'TileSpacing', 'compact'); title(tl, 'Recognition = click in the correct vertical half (chance 0.5)');
ax = nexttile([1 2]); hold(ax, 'on');
for k = 1:K, m = T.participant == k & okC; plot(T.trial(m), T.smC(m), '-', 'Color', cols(k,:), 'LineWidth', 1.8); end
if K > 1, g = groupmean(T, 'smC'); plot(g(:,1), g(:,2), 'k-', 'LineWidth', 2.5); end
yline(0.5, 'k:'); drawswitches(ax, sw); ylim([0 1]); xlim([0 nTrials + 1]); xlabel('Trial'); ylabel(sprintf('Proportion correct (%d-trial moving average)', P.smoothWindow)); grid(ax, 'on'); legendP(K);
ax = nexttile; hold(ax, 'on'); acc = nan(K, 2); for k = 1:K, for f = 0:1, m = T.participant == k & T.familiarity == f & okC; if any(m), acc(k, f+1) = mean(T.correctHalf(m)); end, end, end
bar(1:2, mean(acc, 1, 'omitnan'), 0.5, 'FaceColor', [0.8 0.8 0.8]); for k = 1:K, plot(1:2, acc(k,:), 'o-', 'Color', cols(k,:), 'LineWidth', 1.2); end
yline(0.5, 'k:'); set(ax, 'XTick', 1:2, 'XTickLabel', {'novel', 'familiar'}); ylim([0 1]); ylabel('Proportion correct'); grid(ax, 'on');
% colour error on correct vs incorrect recognition trials (raw and detrended, so that general improvement over time is not mistaken for a recognition effect)
cmp = {'absH', 'Horizontal error', 'raw'; 'dtH', 'Horizontal error, detrended', 'detrended'}; res5 = cell(1, 2);
for a = 1:2
    ax = nexttile; hold(ax, 'on'); M = nan(K, 2); N = zeros(K, 2);
    for k = 1:K, for c = 0:1, m = T.participant == k & T.correctHalf == c; N(k, c+1) = nnz(m & ~isnan(T.(cmp{a,1}))); if N(k, c+1) >= P.minPerGroup, M(k, c+1) = mean(T.(cmp{a,1})(m), 'omitnan'); end, end, end
    for k = 1:K, plot(1:2, M(k,:), 'o-', 'Color', cols(k,:), 'LineWidth', 1.2); end
    if any(~isnan(M(:))), plot(1:2, mean(M, 1, 'omitnan'), 'ks-', 'LineWidth', 3, 'MarkerFaceColor', 'k'); end
    set(ax, 'XTick', 1:2, 'XTickLabel', {'wrong half', 'correct half'}); xlim([0.5 2.5]); ylabel(cmp{a,2}); title(cmp{a,3}); grid(ax, 'on'); res5{a} = struct('M', M, 'N', N);
end
nexttile; axis off; txt = sprintf('n trials with a click: %d\ncorrect half: %d, wrong half: %d\n(per participant in report)', nnz(okC), nnz(T.correctHalf == 1), nnz(T.correctHalf == 0)); text(0, 0.8, txt, 'FontSize', 11, 'VerticalAlignment', 'top');
savefig(fig, outDir, 'fig5_recognition', P);
say('  Overall proportion in the correct half: %.3f (n = %d trials; novel %.3f, familiar %.3f).\n', mean(T.correctHalf(okC)), nnz(okC), mean(T.correctHalf(okC & T.familiarity == 0)), mean(T.correctHalf(okC & T.familiarity == 1)));
for b = unique(T.block)', m = T.block == b & okC; say('    block %d: %.3f correct (n = %d)\n', b, mean(T.correctHalf(m)), nnz(m)); end
for k = 1:K, say('    P%d: %.3f correct (n = %d); binomial test vs 0.5: p = %.3g\n', k, mean(T.correctHalf(T.participant == k & okC)), nnz(T.participant == k & okC), binomp(sum(T.correctHalf(T.participant == k & okC)), nnz(T.participant == k & okC))); end
for a = 1:2
    d = res5{a}.M(:, 2) - res5{a}.M(:, 1); R = bf_stats('ttest1', d); mm = mean(res5{a}.M, 1, 'omitnan');
    say('  %s: mean over participants, wrong half %.3f vs correct half %.3f (difference correct - wrong %+.3f; participants with >= %d trials in both cells: %d; trials per cell, summed: wrong %d, correct %d)', cmp{a,3}, mm(1), mm(2), mm(2) - mm(1), P.minPerGroup, R.n, sum(res5{a}.N(:,1)), sum(res5{a}.N(:,2)));
    if K >= P.minParticipantsForGroupStats && R.n >= 3, say('; paired t(%d) = %.2f, p = %.3f', R.n - 1, R.t, R.p); end, say('\n');
end
% trial-level association, pooled (z-scored within participant): point-biserial between "correct half" and colour error
for a = 1:2, c = groupcorr(T, 'correctHalf', cmp{a,1}, true); say('  Trial-level, %s: Spearman rho between correct-half (1/0) and horizontal error = %+.3f (n = %d trials; p = %.3f; positive = colour errors are LARGER when recognition is correct)\n', cmp{a,3}, c.pooledRho, c.pooledN, c.pooledRhoP); end
for f = 0:1
    sub = T(T.familiarity == f, :); c = groupcorr(sub, 'correctHalf', 'dtH', true); say('    %s pictures only, detrended: rho = %+.3f (n = %d trials)\n', ifelse(f, 'familiar', 'novel'), c.pooledRho, c.pooledN);
end
say('  Reading: the attention-competition hypothesis predicts a relation between recognition and colour accuracy for BOTH novel and familiar pictures; because both skills improve over a session, compare the detrended row.\n');

% ======================================================= 6. secondary: novel vs familiar, lag ==========================================================================
say('\n--- 6. Secondary: novel vs familiar pictures, and repetition lag -----------------------------------------------------------------\n');
fig = newfig('Fig 6  Secondary analyses', [100 100 1300 480]); tl = tiledlayout(1, 3, 'TileSpacing', 'compact'); title(tl, 'Colour (horizontal) error by picture familiarity and repetition lag');
for a = 1:2
    ax = nexttile; hold(ax, 'on'); v = ifelse(a == 1, 'absH', 'dtH'); M = nan(K, 2); N = zeros(K, 2);
    for k = 1:K, for f = 0:1, m = T.participant == k & T.familiarity == f; N(k, f+1) = nnz(m & ~isnan(T.(v))); if N(k, f+1) >= P.minPerGroup, M(k, f+1) = mean(T.(v)(m), 'omitnan'); end, end, end
    for k = 1:K, plot(1:2, M(k,:), 'o-', 'Color', cols(k,:), 'LineWidth', 1.2); end
    if any(~isnan(M(:))), plot(1:2, mean(M, 1, 'omitnan'), 'ks-', 'LineWidth', 3, 'MarkerFaceColor', 'k'); end
    set(ax, 'XTick', 1:2, 'XTickLabel', {'novel', 'familiar'}); xlim([0.5 2.5]); ylabel(ifelse(a == 1, 'Horizontal error', 'Horizontal error, detrended')); title(ifelse(a == 1, 'raw', 'detrended')); grid(ax, 'on');
    d = M(:, 2) - M(:, 1); R = bf_stats('ttest1', d); mm = mean(M, 1, 'omitnan');
    say('  %s: novel %.3f (n = %d trials) vs familiar %.3f (n = %d trials); difference familiar - novel %+.3f over %d participants', ifelse(a == 1, 'raw', 'detrended'), mm(1), sum(N(:,1)), mm(2), sum(N(:,2)), mm(2) - mm(1), R.n);
    if K >= P.minParticipantsForGroupStats && R.n >= 3, say('; paired t(%d) = %.2f, p = %.3f', R.n - 1, R.t, R.p); end, say('\n');
end
ax = nexttile; hold(ax, 'on'); Lm = nan(K, numel(P.lags)); Ln = zeros(1, numel(P.lags));
for k = 1:K, for j = 1:numel(P.lags), m = T.participant == k & T.familiarity == 1 & T.lag == P.lags(j) & ~isnan(T.dtH); Ln(j) = Ln(j) + nnz(m); if nnz(m) >= 3, Lm(k, j) = mean(T.dtH(m)); end, end, end
for k = 1:K, plot(1:numel(P.lags), Lm(k,:), 'o-', 'Color', cols(k,:), 'LineWidth', 1.2); end
if any(~isnan(Lm(:))), plot(1:numel(P.lags), mean(Lm, 1, 'omitnan'), 'ks-', 'LineWidth', 3, 'MarkerFaceColor', 'k'); end
set(ax, 'XTick', 1:numel(P.lags), 'XTickLabel', arrayfun(@(l, n) sprintf('lag %d\n(n=%d)', l, n), P.lags, Ln, 'UniformOutput', false)); xlim([0.5 numel(P.lags) + 0.5]); yline(0, 'k:'); ylabel('Horizontal error, detrended'); title('Familiar pictures by repetition lag'); grid(ax, 'on');
savefig(fig, outDir, 'fig6_novel_familiar_lag', P);
fm = T.familiarity == 1 & ~isnan(T.lag); c = groupcorr(T(fm, :), 'lag', 'absH', true); cd = groupcorr(T(fm, :), 'lag', 'dtH', true);
say('  Familiar pictures by lag (trials): %s\n', strjoin(arrayfun(@(l, n) sprintf('lag %d: n = %d, mean raw error %.3f', l, n, mean(T.absH(fm & T.lag == l))), P.lags, Ln, 'UniformOutput', false), '; '));
say('  Spearman rho between lag and horizontal error over %d familiar trials: raw %+.3f (p = %.3f), detrended %+.3f (p = %.3f). Lags are determined by the schedule, so only %d-%d trials per lag per participant are expected; do not read small differences.\n', c.pooledN, c.pooledRho, c.pooledRhoP, cd.pooledRho, cd.pooledRhoP, min(Ln(Ln > 0)), max(Ln));
say('\nFigures and this report were written to %s\n', outDir);
results.fig2 = struct('raw', raw, 'detrended', dt); results.earlyLate = E; results.recognition = res5;
end

% =============================================================== local helpers ===============================================================================
function f = newfig(name, pos), f = figure('Name', name, 'NumberTitle', 'off', 'Position', pos, 'Color', 'w'); end
function savefig(fig, outDir, name, P)
if P.saveFigures, fn = fullfile(outDir, [name '.png']); try, exportgraphics(fig, fn, 'Resolution', 130); catch, saveas(fig, fn); end, end
end
function bf_say(fid, varargin), s = sprintf(varargin{:}); fprintf('%s', s); fprintf(fid, '%s', s); end
function y = ifelse(c, a, b), if c, y = a; else, y = b; end, end
function legendP(K), if K > 1 && K <= 10, legend(arrayfun(@(k) sprintf('P%d', k), 1:K, 'UniformOutput', false), 'Location', 'northeast', 'Box', 'off', 'NumColumns', 2); end, end
function sw = bf_switches(info), sw = unique(cell2mat(arrayfun(@(i) info(i).switchPoints(:)', 1:numel(info), 'UniformOutput', false))); end
function drawswitches(ax, sw), for s = sw(:)', xline(ax, s + 0.5, '--', 'Color', [0.8 0.1 0.1], 'LineWidth', 1.2, 'Label', 'switch', 'LabelOrientation', 'horizontal', 'LabelVerticalAlignment', 'bottom', 'HandleVisibility', 'off'); end, end
function g = groupmean(T, v), tr = unique(T.trial); mu = nan(numel(tr), 1); for i = 1:numel(tr), mu(i) = mean(T.(v)(T.trial == tr(i)), 'omitnan'); end, g = [tr mu]; end
function m = segmean(T, mask, v, third)
% mean of column v over the first (third = 1) or last (third = 3) third of the trials of a rule block (by position in the block, pooled over participants)
L = max(T.trialInBlock(mask)); if third == 1, sel = mask & T.trialInBlock <= L / 3; else, sel = mask & T.trialInBlock > 2 * L / 3; end, m = mean(T.(v)(sel), 'omitnan');
end
function p = binomp(k, n), x = 0:n; pr = arrayfun(@(i) exp(gammaln(n+1) - gammaln(i+1) - gammaln(n-i+1) - n*log(2)), x); p = min(1, sum(pr(pr <= pr(k+1) * (1 + 1e-9)))); end

function R = groupcorr(T, xv, yv, rankOnly)
% Correlation of two columns, pooled over participants after z-scoring each participant's values (so differences in overall level between people do not create correlations),
% plus per-participant correlations (perR) and a test of the mean Fisher-z across participants.
if nargin < 4, rankOnly = false; end %#ok<NASGU>
K = max(T.participant); X = []; Y = []; perR = nan(K, 1); perN = zeros(K, 1); perZ = nan(K, 1);
for k = 1:K
    m = T.participant == k; x = T.(xv)(m); y = T.(yv)(m); c = bf_stats('corr', x, y); perR(k) = c.r; perN(k) = c.n; if ~isnan(c.r) && c.n > 3, perZ(k) = atanh(c.r); end
    ok = ~isnan(x) & ~isnan(y); if nnz(ok) > 3, X = [X; bf_stats('zscore', x(ok))]; Y = [Y; bf_stats('zscore', y(ok))]; end %#ok<AGROW>
end
c = bf_stats('corr', X, Y); R.pooledN = c.n; R.pooledR = c.r; R.pooledP = c.p; R.pooledRho = c.rho; R.pooledRhoP = c.rhoP; R.perR = perR; R.perN = perN;
R.meanR = tanh(mean(perZ, 'omitnan')); t = bf_stats('ttest1', perZ); R.groupT = t.t; R.groupP = t.p; R.groupN = t.n;
end

function reportcorr(say, label, R, K, P, useRho)
if nargin < 6, useRho = false; end
if useRho, say('  %-34s pooled rho = %+.3f (n = %d trials, p = %.3g)', label, R.pooledRho, R.pooledN, R.pooledRhoP); else, say('  %-12s pooled r = %+.3f (n = %d trials, p = %.3g; rho = %+.3f)', label, R.pooledR, R.pooledN, R.pooledP, R.pooledRho); end
if K > 1, say('; per participant r = %s (n = %s)', mat2str(round(R.perR', 2)), mat2str(R.perN')); end
if K >= P.minParticipantsForGroupStats && R.groupN >= 3, say('; mean r = %+.2f, t(%d) = %.2f, p = %.3f across participants', R.meanR, R.groupN - 1, R.groupT, R.groupP); end
say('\n');
end

function panel(ax, T, xv, yv, cols, K, R, ttl, xl, yl)
hold(ax, 'on'); for k = 1:K, m = T.participant == k; scatter(T.(xv)(m), T.(yv)(m), 14, cols(k,:), 'filled', 'MarkerFaceAlpha', 0.35); end
x = T.(xv); y = T.(yv); ok = ~isnan(x) & ~isnan(y); if nnz(ok) > 3, pf = polyfit(x(ok), y(ok), 1); xs = [min(x(ok)) max(x(ok))]; plot(xs, polyval(pf, xs), 'k-', 'LineWidth', 2); end
if isfield(R, 'pooledR') && ~isnan(R.pooledR), s = sprintf('r = %+.2f, rho = %+.2f\nn = %d trials, %d participant(s)', R.pooledR, R.pooledRho, R.pooledN, K); else, s = sprintf('rho = %+.2f\nn = %d trials, %d participant(s)', R.pooledRho, R.pooledN, K); end
text(ax, 0.03, 0.97, s, 'Units', 'normalized', 'VerticalAlignment', 'top', 'BackgroundColor', [1 1 1 0.8], 'FontSize', 10);
xlabel(ax, xl); ylabel(ax, yl); title(ax, ttl, 'FontSize', 10); grid(ax, 'on');
end

function E = earlylate(T, P)
rows = [];
for k = 1:max(T.participant), for b = unique(T.block)'
    idx = find(T.participant == k & T.block == b); n = numel(idx); kk = floor(n * P.earlyLateFrac); if n < P.minBlockTrials || kk < P.minSegmentTrials, continue; end
    [~, o] = sort(T.trial(idx)); idx = idx(o); e = idx(1:kk); l = idx(end-kk+1:end);
    rows(end+1, :) = [k b kk kk segr(T, e, false) segr(T, l, false) segr(T, e, true) segr(T, l, true)]; %#ok<AGROW>
end, end
if isempty(rows), rows = zeros(0, 8); end
E = array2table(rows, 'VariableNames', {'participant', 'block', 'nEarly', 'nLate', 'rEarly', 'rLate', 'rEarlyDT', 'rLateDT'});
end
function r = segr(T, idx, detrend)
x = T.absV(idx); y = T.absH(idx); if detrend, t = T.trial(idx); x = x - polyval(polyfit(t, x, 1), t); y = y - polyval(polyfit(t, y, 1), t); end
c = bf_stats('corr', x, y); r = c.r;
end
