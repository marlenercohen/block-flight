function s = bf_smooth(T, v, window)
% Moving average of column v within each participant and rule block (so smoothing never mixes trials from before and after a colour-rule switch). Missing values are skipped.
s = nan(height(T), 1);
for k = unique(T.participant)', for b = unique(T.block(T.participant == k))'
    idx = find(T.participant == k & T.block == b); [~, o] = sort(T.trial(idx)); idx = idx(o); s(idx) = movmean(T.(v)(idx), window, 'omitnan', 'Endpoints', 'shrink');
end, end
end
