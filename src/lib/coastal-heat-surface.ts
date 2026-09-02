import { heatColor, type MapMode } from "./climate-map";

type XY = [number, number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type HeatSurface = {
  width: number; height: number; alpha: Uint8ClampedArray;
  pixels: number[]; contributions: { indices: number[]; weights: number[] }[];
};

// Display-only local Gaussian interpolation. No statistics are computed from this raster.
export function prepareHeatSurface(points: XY[], polygons: XY[][][], bounds: Bounds): HeatSurface {
  const width = 1536, height = Math.ceil(width * (bounds.maxY - bounds.minY) / (bounds.maxX - bounds.minX));
  const mask = document.createElement("canvas"); mask.width = width; mask.height = height;
  const context = mask.getContext("2d", { willReadFrequently: true })!;
  const sx = width / (bounds.maxX - bounds.minX), sy = height / (bounds.maxY - bounds.minY);
  const toPixel = ([x, y]: XY): XY => [(x - bounds.minX) * sx, (bounds.maxY - y) * sy];
  context.fillStyle = "white";
  polygons.forEach((polygon) => {
    context.beginPath();
    polygon.forEach((ring) => {
      ring.forEach((point, index) => { const [x, y] = toPixel(point); if (index) context.lineTo(x, y); else context.moveTo(x, y); });
      context.closePath();
    });
    context.fill("evenodd");
  });
  const land = context.getImageData(0, 0, width, height).data;
  const nearestWeight = new Float32Array(width * height);
  const radius = 0.245, sigma = 0.1;
  const contributions = points.map((point) => {
    const [px, py] = toPixel(point), indices: number[] = [], weights: number[] = [];
    const minX = Math.max(0, Math.floor(px - radius * sx)), maxX = Math.min(width - 1, Math.ceil(px + radius * sx));
    const minY = Math.max(0, Math.floor(py - radius * sy)), maxY = Math.min(height - 1, Math.ceil(py + radius * sy));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const index = y * width + x;
      if (!land[index * 4 + 3]) continue;
      const squaredDistance = ((x + 0.5 - px) / sx) ** 2 + ((y + 0.5 - py) / sy) ** 2;
      if (squaredDistance > radius ** 2) continue;
      const weight = Math.exp(-squaredDistance / (2 * sigma ** 2));
      indices.push(index); weights.push(weight);
      nearestWeight[index] = Math.max(nearestWeight[index], weight);
    }
    return { indices, weights };
  });
  const alpha = new Uint8ClampedArray(width * height), pixels: number[] = [];
  nearestWeight.forEach((weight, index) => {
    const t = Math.max(0, Math.min(1, (weight - 0.07) / 0.4));
    alpha[index] = Math.round(land[index * 4 + 3] * 0.96 * t * t * (3 - 2 * t));
    if (alpha[index]) pixels.push(index);
  });
  return { width, height, alpha, pixels, contributions };
}

export function renderHeatFrame(surface: HeatSurface, values: number[], low: number, high: number, mode: MapMode) {
  const { width, height, contributions, pixels, alpha } = surface;
  const sum = new Float32Array(width * height), weights = new Float32Array(width * height);
  contributions.forEach((contribution, pointIndex) => {
    if (!Number.isFinite(values[pointIndex])) return;
    contribution.indices.forEach((pixel, i) => {
      sum[pixel] += values[pointIndex] * contribution.weights[i]; weights[pixel] += contribution.weights[i];
    });
  });
  const palette = Array.from({ length: 256 }, (_, i) => heatColor(i / 255, mode).match(/\d+/g)!.map(Number));
  const rgba = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel) => {
    if (!weights[pixel]) return;
    const t = Math.max(0, Math.min(1, (sum[pixel] / weights[pixel] - low) / Math.max(high - low, 1e-9)));
    const color = palette[Math.round(t * 255)], offset = pixel * 4;
    rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = alpha[pixel];
  });
  return rgba;
}
