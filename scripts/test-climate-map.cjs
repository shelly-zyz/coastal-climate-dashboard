const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/climate-map.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { frameValues, valueRange, provinceStats, heatColor } = context.exports;
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));
same(valueRange([-3, 2], true), [-3, 3]);
same(valueRange([5, 5]), [4.5, 5.5]);
same(valueRange([]), [0, 1]);
assert.equal(heatColor(0, 'annual'), 'rgb(23,84,207)');
assert.equal(heatColor(1, 'annual'), 'rgb(239,57,62)');
assert.equal(heatColor(0.5, 'trend'), 'rgb(229,238,233)');
const tinyGrid = [{ lon: 0, lat: 0, tas_mean: 10 }, { lon: 0, lat: 60, tas_mean: 20 }];
const tinyStats = provinceStats(tinyGrid, [10, 20], { indices: [0, 1] });
assert.ok(Math.abs(tinyStats.value - 40 / 3) < 1e-10);
assert.equal(provinceStats(tinyGrid, [10, 20], { indices: [] }), null);
assert.equal(provinceStats(tinyGrid, [10, 20], null), null);
same(frameValues(tinyGrid, null, 'tas', 'mean', 2021), [10, 20]);
same(frameValues(tinyGrid, null, 'tas', 'annual', 2021), []);

const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data/climate-dashboard.json')));
const evolution = JSON.parse(fs.readFileSync(path.join(root, 'public/data/climate-evolution.json')));
assert.equal(evolution.provinces.length, 34);
assert.equal(evolution.years.length, 10);
assert.equal(evolution.coordinates.length, data.grid.length);
evolution.coordinates.forEach(([lon, lat], i) => { assert.equal(lon, data.grid[i].lon); assert.equal(lat, data.grid[i].lat); });
const membership = evolution.provinces.flatMap(p => p.indices);
assert.equal(new Set(membership).size, membership.length);
for (const variable of Object.keys(data.variables)) {
  for (const year of evolution.years) {
    const values = frameValues(data.grid, evolution, variable, 'annual', year);
    assert.equal(values.length, 255);
    assert.ok(values.every(Number.isFinite));
    const stats = provinceStats(data.grid, values, { indices: data.grid.map((_, i) => i) });
    const annual = data.annual.find(row => row.variable === variable && row.year === year);
    assert.ok(Math.abs(stats.value - annual.value) < 0.002, variable + ':' + year);
  }
  assert.notEqual(JSON.stringify(evolution.annual[variable][0]), JSON.stringify(evolution.annual[variable][9]));
}
const heatModule = { exports: {}, require: () => context.exports };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/coastal-heat-surface.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, heatModule);
const surface = {
  width: 2, height: 1, alpha: new Uint8ClampedArray([245, 0]), pixels: [0],
  contributions: [{ indices: [0], weights: [1] }, { indices: [0], weights: [1] }],
};
const blended = heatModule.exports.renderHeatFrame(surface, [0, 10], 0, 10, 'annual');
same(Array.from(blended.slice(0, 3)), heatColor(128 / 255, 'annual').match(/\d+/g).map(Number));
assert.equal(blended[3], 245);
assert.equal(blended[7], 0);
const missing = heatModule.exports.renderHeatFrame(surface, [NaN, 10], 0, 10, 'annual');
same(Array.from(missing.slice(0, 3)), [239, 57, 62]);
assert.ok(heatModule.exports.renderHeatFrame(surface, [], 0, 10, 'annual').every(v => v === 0));
console.log('PASS: fixed color scales, weighted province stats, empty states, all 50 annual frames, source reconciliation, heat interpolation and transparent masking.');
