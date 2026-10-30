function P = bf_params()
% Analysis settings for Block Flight. Edit the numbers here; everything else reads them.
P.smoothWindow     = 15;     % trials in the moving average used for smoothed learning curves (smoothing never crosses a colour-rule switch)
P.detrendWindow    = 21;     % trials in the moving average that is subtracted to remove slow trends (learning, fatigue) before looking at trial-by-trial relations
P.earlyLateFrac    = 1/3;    % "early" = first third and "late" = last third of each rule block
P.minBlockTrials   = 24;     % a rule block needs at least this many clicked trials for the early / late comparison
P.minSegmentTrials = 8;      % an early or late segment needs at least this many trials for a correlation
P.minPerGroup      = 5;      % minimum trials per cell (e.g. correct / incorrect recognition) for a participant to enter a paired comparison
P.minTrialsCaution = 100;    % fewer clicked trials than this (per participant) -> the report warns that results are descriptive only
P.minParticipantsForGroupStats = 5;   % group-level t-tests across participants are only reported with at least this many participants
P.rtMinMs          = 150;    % reaction times outside [rtMinMs, rtMaxMs] are treated as missing in the reaction-time analyses (anticipations / lapses)
P.rtMaxMs          = 15000;
P.alignPre         = 10;     % trials before a switch shown in the switch-aligned plot
P.alignPost        = 40;     % trials after a switch shown in the switch-aligned plot
P.lags             = [1 2 3 5];   % repetition lags of familiar pictures
P.saveFigures      = true;   % write PNG files to the output folder
end
