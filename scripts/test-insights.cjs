const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(name, dependencies = {}) {
  const context = { exports: {}, require: name => { if (!dependencies[name]) throw new Error(name); return dependencies[name]; } };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const map = load('climate-map');
const insights = load('climate-insights', { './climate-map': map });
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'public/data', name + '.json'), 'utf8'));
const data = read('climate-dashboard'), evolution = read('climate-evolution'), monthly = read('climate-monthly');
const close = (actual, expected, context, tolerance = 0.004) => assert.ok(Math.abs(actual - expected) < tolerance, `${context}: ${actual} != ${expected}`);
const province = evolution.provinces.find(p => p.name === '浙江省');
const empty = evolution.provinces.find(p => !p.indices.length);
for (const variable of insights.VARIABLES) {
  const first = insights.regionInsight(data, evolution, variable, 'annual', 2021, null);
  const next = insights.regionInsight(data, evolution, variable, 'annual', 2022, null);
  assert.equal(first.delta, null);
  close(next.delta, next.value - first.value, 'year over year', 1e-9);
  assert.notEqual(first.value, next.value);
  close(first.deviation, first.value - data.variables[variable].mean, 'climatology deviation');
  assert.equal(insights.regionInsight(data, evolution, variable, 'annual', 2021, empty).value, null);
  assert.equal(insights.regionInsight(data, evolution, variable, 'mean', 2021, empty).rank, null);
  for (const mode of ['annual', 'mean', 'trend']) {
    const metric = insights.regionInsight(data, evolution, variable, mode, 2025, province);
    close(metric.value, map.provinceStats(data.grid, map.frameValues(data.grid, evolution, variable, mode, 2025), province).value, 'province matches map', 1e-9);
    assert.equal(metric.rank, metric.ranking.findIndex(r => r.province.name === province.name) + 1);
    assert.ok(metric.ranking.every((row, i, rows) => i === 0 || rows[i - 1].stats.value >= row.stats.value));
  }
  for (const p of [null, ...evolution.provinces]) {
    const name = p?.name ?? insights.ALL_COAST;
    const region = monthly.regions[name];
    assert.equal(region.monthly[variable].length, 10);
    for (let yi = 0; yi < 10; yi++) {
      const profile = insights.monthlyProfile(monthly, name, variable, monthly.years[yi], true);
      assert.equal(profile.length, 12);
      if (!region.count) { assert.ok(profile.every(v => v === null)); continue; }
      assert.ok(profile.every(Number.isFinite));
      const reconstructed = insights.weightedAverage(profile, monthly.days[yi]);
      const expected = insights.annualSeries(data, evolution, variable, p)[yi];
      close(reconstructed, expected, `${variable} ${name} ${monthly.years[yi]}`);
      const seasons = insights.seasonalProfile(monthly, name, variable, monthly.years[yi], true);
      const weights = [[2,3,4],[5,6,7],[8,9,10],[11,0,1]].map(indices => indices.reduce((n,i) => n + monthly.days[yi][i], 0));
      close(insights.weightedAverage(seasons.map(s => s.value), weights), reconstructed, 'season reconstruction', 1e-8);
    }
  }
  for (const zone of insights.ZONES) {
    const profile = insights.monthlyProfile(monthly, zone, variable, 2021, false);
    for (let month = 0; month < 12; month++) {
      const original = data.monthly.find(row => row.variable === variable && row.zone.startsWith(zone) && row.month === month + 1);
      close(profile[month], original.value, `${variable} ${zone} month ${month + 1}`);
    }
  }
}
assert.equal(monthly.days[3][1], 29);
assert.equal(monthly.days[0][1], 28);
assert.equal(insights.signedNumber(0.00001), '0');
assert.equal(insights.signedNumber(-0.00001), '0');
assert.equal(insights.signedNumber(0.004), '+0.004');
assert.equal(insights.formatNumber(null), '暂无');
assert.equal(insights.matrixColor(0), 'rgb(23,84,207)');
assert.equal(insights.matrixColor(1), 'rgb(239,57,62)');
for (const fraction of [-1, 0, .1, .2, .4, .5, .6, .8, 1, 2]) {
  assert.equal(insights.matrixColor(fraction), map.heatColor(fraction, 'mean'), 'matrix shares map level palette');
}
console.log('PASS: 5 variables x 10 years x 35 regions; monthly/annual/seasonal reconciliation, province rankings, missing samples, leap days, baseline deltas and fixed color endpoints.');
