import { frameValues, heatColor, provinceStats, type EvolutionData, type GridRow, type MapMode, type Province, type VariableKey } from './climate-map';

export type VariableSummary = { name: string; unit: string; mean: number; p10: number; p90: number; median: number; min: number; max: number; trend: number; pValue: number; r2: number };
export type DashboardData = {
  meta: { recordId: string; model: string; scenario: string; period: string; coastalWidthKm: number; gridCount: number; generatedAt: string };
  variables: Record<VariableKey, VariableSummary>;
  annual: { variable: VariableKey; year: number; value: number }[];
  grid: GridRow[];
};
export type MonthlyData = {
  years: number[]; days: number[][];
  regions: Record<string, { count: number; monthly: Record<VariableKey, (number | null)[][]> }>;
  reconciliation: Record<VariableKey, { maxAnnualGridError: number; months: number }>;
};
export const ALL_COAST = '中国沿海整体';
export const VARIABLES: VariableKey[] = ['tas', 'huss', 'rsds', 'sfcwind', 'ps'];
export const SHORT_NAMES = { tas: '气温', huss: '比湿', rsds: '短波辐射', sfcwind: '风速', ps: '气压' };
export const ZONES = ['北部沿海', '中部沿海', '南部沿海'];
export const ZONE_COLORS = ['#8bb8db', '#e2bf81', '#7fcbb8'];
export const shortProvince = (name: string) => name.replace(/壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市/g, '');
export const formatNumber = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? '暂无' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
export const signedNumber = (value: number | null, digits = 3) => {
  if (value == null || !Number.isFinite(value)) return '暂无';
  const rounded = Number(value.toFixed(digits));
  return rounded === 0 ? '0' : `${rounded > 0 ? '+' : ''}${formatNumber(rounded, digits)}`;
};

export function regionStats(grid: GridRow[], values: number[], province: Province | null) {
  return provinceStats(grid, values, province ?? { name: ALL_COAST, number: 0, indices: grid.map((_, i) => i) });
}

export function annualSeries(data: DashboardData, evolution: EvolutionData, variable: VariableKey, province: Province | null) {
  return evolution.years.map((year, index) => province
    ? provinceStats(data.grid, evolution.annual[variable][index], province)?.value ?? null
    : data.annual.find(row => row.variable === variable && row.year === year)?.value ?? null);
}

export function regionInsight(data: DashboardData, evolution: EvolutionData, variable: VariableKey, mode: MapMode, year: number, province: Province | null) {
  const values = frameValues(data.grid, evolution, variable, mode, year);
  const stats = regionStats(data.grid, values, province);
  const series = annualSeries(data, evolution, variable, province);
  const yi = evolution.years.indexOf(year);
  const mean = regionStats(data.grid, frameValues(data.grid, evolution, variable, 'mean', year), province)?.value ?? null;
  const overall = regionStats(data.grid, values, null)?.value ?? null;
  const value = mode === 'annual' ? series[yi] ?? null : stats?.value ?? null;
  const previous = yi > 0 ? series[yi - 1] : null;
  const delta = mode === 'annual' && value != null && previous != null ? value - previous : null;
  const baseline = mode === 'annual' ? mean : overall;
  const deviation = value != null && baseline != null ? value - baseline : null;
  const ranking = evolution.provinces.map(p => ({ province: p, stats: provinceStats(data.grid, values, p) }))
    .filter((p): p is { province: Province; stats: NonNullable<ReturnType<typeof provinceStats>> } => p.stats !== null)
    .sort((a, b) => b.stats.value - a.stats.value || a.province.number - b.province.number);
  const rankIndex = province ? ranking.findIndex(p => p.province.name === province.name) : -1;
  const trend = regionStats(data.grid, frameValues(data.grid, evolution, variable, 'trend', year), province)?.value ?? null;
  return { value, stats, series, delta, deviation, trend, overall, ranking, rank: rankIndex < 0 ? null : rankIndex + 1 };
}

export function weightedAverage(values: (number | null)[], weights: number[]) {
  let numerator = 0, denominator = 0;
  values.forEach((value, i) => { if (value != null && Number.isFinite(value) && weights[i] > 0) { numerator += value * weights[i]; denominator += weights[i]; } });
  return denominator ? numerator / denominator : null;
}

export function monthlyProfile(data: MonthlyData, name: string, variable: VariableKey, year: number, annual: boolean) {
  const region = data.regions[name];
  const yi = data.years.indexOf(year);
  if (!region || !region.count || yi < 0) return Array<number | null>(12).fill(null);
  if (annual) return region.monthly[variable][yi];
  return Array.from({ length: 12 }, (_, month) => weightedAverage(region.monthly[variable].map(row => row[month]), data.days.map(row => row[month])));
}

export function seasonalProfile(data: MonthlyData, name: string, variable: VariableKey, year: number, annual: boolean) {
  const profile = monthlyProfile(data, name, variable, year, annual);
  const yi = data.years.indexOf(year);
  const days = annual ? data.days[yi] : Array.from({ length: 12 }, (_, month) => data.days.reduce((sum, row) => sum + row[month], 0));
  if (!days) return [];
  return [ [2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 0, 1] ].map((months, i) => ({
    season: ['春', '夏', '秋', '冬'][i],
    value: weightedAverage(months.map(month => profile[month]), months.map(month => days[month])),
  }));
}

export function matrixColor(fraction: number) {
  // The matrix always shows monthly levels, even while the map shows trends.
  return heatColor(fraction, 'mean');
}
