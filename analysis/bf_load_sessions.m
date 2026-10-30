function [T, info] = bf_load_sessions(files)
% Read Block Flight JSON logs (schema blockflight-log/1) into one table with a row per EXPERIMENTAL trial in which the participant clicked.
% Practice trials and trials without a click (result 'no_click') are not in T; their counts are in info.
%   T columns: participant (1..K, one per file), trial, block, trialInBlock, rule (0 original colour mapping, 1 mirrored), familiarity (0 novel, 1 familiar), lag (NaN for novel),
%              cue, u, v (click position on the picture face), signedH, signedV (click - optimum), absH, absV (|error|; absV = distance from the correct edge),
%              correctHalf (1 = click in the correct vertical half for this familiarity, 0 = wrong half), rtMs, multiplier, distance (metres travelled away from the camera)
if ischar(files) || isstring(files), files = cellstr(files); end
rows = {}; info = struct('file', {}, 'sessionId', {}, 'nExperimental', {}, 'nClicked', {}, 'nNoClick', {}, 'switchPoints', {}, 'nPractice', {});
for k = 1:numel(files)
    S = jsondecode(fileread(files{k}));
    tr = S.trials;                                           % jsondecode gives a struct array when all trials have the same fields, otherwise a cell array of structs (handled below)
    nExp = 0; nClick = 0; nNo = 0; nPrac = 0; sp = []; blk = 0; prevRule = ''; blockStart = 0;   % blk / blockStart: used only for older logs that have no blockNumber / trialInBlock
    for i = 1:numel(tr)
        if iscell(tr), t = tr{i}; else, t = tr(i); end
        if ~strcmp(t.phase, 'experiment'), nPrac = nPrac + 1; continue; end
        nExp = nExp + 1; if isfield(t, 'switchPoints') && ~isempty(t.switchPoints), sp = t.switchPoints(:)'; end
        if ~strcmp(t.colorRulePhase, prevRule), if ~isempty(prevRule) && ~(isfield(t, 'switchPoints') && ~isempty(t.switchPoints)), sp(end+1) = t.trialNumber - 1; end, blk = blk + 1; blockStart = t.trialNumber - 1; prevRule = t.colorRulePhase; end   % older logs: derive blocks from the logged mapping
        if isfield(t, 'blockNumber') && ~isempty(t.blockNumber) && t.blockNumber > 0, blockNo = t.blockNumber; else, blockNo = blk; end
        if isfield(t, 'trialInBlock') && ~isempty(t.trialInBlock), tib = t.trialInBlock; else, tib = t.trialNumber - blockStart; end
        if ~isstruct(t.click) || isempty(t.click), nNo = nNo + 1; continue; end
        c = t.click; nClick = nClick + 1;
        fam = strcmp(t.image.familiarity, 'familiar');
        lag = NaN; if fam && isfield(t.image, 'lagTrials') && ~isempty(t.image.lagTrials), lag = t.image.lagTrials; end
        if fam, correct = double(c.v > 0.5); else, correct = double(c.v < 0.5); end
        if c.v == 0.5, correct = NaN; end
        rule = double(strcmp(t.colorRulePhase, 'reversed'));
        rows(end+1, :) = {k, t.trialNumber, blockNo, tib, rule, double(fam), lag, t.cue, c.u, c.v, ...
            c.horizontalError, c.verticalError, c.absHorizontalError, c.absVerticalError, correct, c.reactionTimeMs, c.multiplier, num(t, 'outcome', 'distanceAway')}; %#ok<AGROW>
    end
    info(k).file = files{k}; info(k).sessionId = S.session.sessionId; info(k).nExperimental = nExp; info(k).nClicked = nClick; info(k).nNoClick = nNo; info(k).switchPoints = sp; info(k).nPractice = nPrac;
end
names = {'participant','trial','block','trialInBlock','rule','familiarity','lag','cue','u','v','signedH','signedV','absH','absV','correctHalf','rtMs','multiplier','distance'};
if isempty(rows), T = cell2table(cell(0, numel(names)), 'VariableNames', names); else, T = cell2table(rows, 'VariableNames', names); end
T = sortrows(T, {'participant', 'trial'});
end

function x = num(t, f1, f2)
x = NaN; if isfield(t, f1) && isstruct(t.(f1)) && isfield(t.(f1), f2) && ~isempty(t.(f1).(f2)), x = t.(f1).(f2); end
end
