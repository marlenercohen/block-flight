function d = bf_detrend(T, v, window)
% Residual of column v after subtracting its moving average (window trials) within each participant and rule block. Removes slow changes (learning, fatigue) and keeps trial-to-trial fluctuations.
d = nan(height(T), 1);
for k = unique(T.participant)', for b = unique(T.block(T.participant == k))'
    idx = find(T.participant == k & T.block == b); [~, o] = sort(T.trial(idx)); idx = idx(o); x = T.(v)(idx); d(idx) = x - movmean(x, window, 'omitnan', 'Endpoints', 'shrink');
end, end
end
