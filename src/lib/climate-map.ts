export type VariableKey = "tas" | "huss" | "rsds" | "sfcwind" | "ps";
export type MapMode = "annual" | "mean" | "trend";
export type GridRow = { lon: number; lat: number } & Record<string, number>;
export type Province = { name: string; number: number; indices: number[] };
export type EvolutionData = {
  years: number[];
  coordinates: [number, number][];
  provinces: Province[];
  annual: Record<VariableKey, number[][]>;
  unassignedGridCount: number;
};

export const heatStops = ["#1754cf", "#00b7e9", "#12ce8b", "#f4df35", "#ff9827", "#ef393e"];
export const trendStops = ["#2164d8", "#52bde5", "#e5eee9", "#f1a84c", "#e3433c"];
export function heatColor(t: number, mode: MapMode) {
  const stops = mode === "trend" ? trendStops : heatStops;
  const position = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  const fraction = position - index;
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const start = rgb(stops[index]), end = rgb(stops[index + 1]);
  return `rgb(${start.map((v, i) => Math.round(v + (end[i] - v) * fraction)).join(",")})`;
}

export function frameValues(grid: GridRow[], evolution: EvolutionData | null, variable: VariableKey, mode: MapMode, year: number) {
  if (mode === "annual") return evolution?.annual[variable][evolution.years.indexOf(year)] ?? [];
  return grid.map((point) => point[`${variable}_${mode === "mean" ? "mean" : "trend_per_decade"}`]);
}

export function valueRange(values: number[], diverging = false): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  const min = Math.min(...finite), max = Math.max(...finite);
  if (diverging) { const limit = Math.max(Math.abs(min), Math.abs(max), 1e-6); return [-limit, limit]; }
  return min === max ? [min - 0.5, max + 0.5] : [min, max];
}

export function provinceStats(grid: GridRow[], values: number[], province: Province | null) {
  if (!province) return null;
  const indices = province.indices.filter((index) => grid[index] && Number.isFinite(values[index]));
  if (!indices.length) return null;
  let numerator = 0, denominator = 0;
  for (const index of indices) {
    const weight = Math.cos(grid[index].lat * Math.PI / 180);
    numerator += values[index] * weight;
    denominator += weight;
  }
  const samples = indices.map((index) => values[index]);
  return { value: numerator / denominator, count: indices.length, min: Math.min(...samples), max: Math.max(...samples) };
}
