function varargout = bf_stats(fn, varargin)
% Small statistics helpers that need only base MATLAB (no toolboxes). Call as bf_stats('corr', x, y), etc.
[varargout{1:max(nargout,1)}] = feval(['s_' fn], varargin{:});
end

function R = s_corr(x, y)
% Pearson and Spearman correlation of two vectors (rows with NaN in either are dropped). R has n, r, p, rho, rhoP.
x = x(:); y = y(:); ok = ~isnan(x) & ~isnan(y); x = x(ok); y = y(ok); R.n = numel(x); R.r = NaN; R.p = NaN; R.rho = NaN; R.rhoP = NaN;
if R.n < 4 || std(x) == 0 || std(y) == 0, return; end
c = corrcoef(x, y); R.r = c(1,2); R.p = s_rpval(R.r, R.n);
R.rho = corr_pearson(s_rank(x), s_rank(y)); R.rhoP = s_rpval(R.rho, R.n);
end

function r = corr_pearson(x, y), c = corrcoef(x, y); r = c(1,2); end

function p = s_rpval(r, n)
% two-sided p for a correlation r from n pairs (t distribution via the regularised incomplete beta function)
if isnan(r) || n < 3, p = NaN; return; end
if abs(r) >= 1, p = 0; return; end
t = r * sqrt((n - 2) / (1 - r^2)); p = s_tpval(t, n - 2);
end

function p = s_tpval(t, df)
% two-sided p for a t statistic
if isnan(t) || df < 1, p = NaN; return; end
p = betainc(df / (df + t^2), df / 2, 0.5);
end

function r = s_rank(x)
% ranks with ties averaged
[~, ord] = sort(x); r = zeros(size(x)); r(ord) = 1:numel(x);
[u, ~, j] = unique(x); for k = 1:numel(u), m = (j == k); if nnz(m) > 1, r(m) = mean(r(m)); end, end
end

function R = s_ttest1(d)
% one-sample t test of the values in d against 0 (or paired test when d is a difference). R has n, mean, sd, se, t, p.
d = d(~isnan(d)); R.n = numel(d); R.mean = mean(d); R.sd = std(d); R.se = R.sd / sqrt(max(R.n, 1)); R.t = NaN; R.p = NaN;
if R.n >= 3 && R.sd > 0, R.t = R.mean / R.se; R.p = s_tpval(R.t, R.n - 1); end
end

function R = s_fisherdiff(r1, n1, r2, n2)
% compare two independent correlations with Fisher z. R has z and two-sided p.
R.z = NaN; R.p = NaN; if n1 > 3 && n2 > 3 && ~isnan(r1) && ~isnan(r2)
    R.z = (atanh(r1) - atanh(r2)) / sqrt(1/(n1-3) + 1/(n2-3)); R.p = erfc(abs(R.z) / sqrt(2)); end
end

function z = s_zscore(x), x = x(:); z = (x - mean(x, 'omitnan')) ./ std(x, 'omitnan'); end
