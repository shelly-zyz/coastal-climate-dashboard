"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import { TrendingUp, CalendarDays, Layers3, X, ChevronsRight, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type EvolutionData, type MapMode, type Province, type VariableKey, heatStops, provinceStats, valueRange } from '../lib/climate-map';
import { ALL_COAST, annualSeries, formatNumber as fmt, matrixColor, monthlyProfile, regionInsight, seasonalProfile, SHORT_NAMES, shortProvince, signedNumber, ZONES, ZONE_COLORS, type DashboardData, type MonthlyData } from '../lib/climate-insights';

export type InsightProps = { data: DashboardData; evolution: EvolutionData; variable: VariableKey; mode: MapMode; year: number; province: Province | null };
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2><ChevronsRight className="section-arrow" size={17} aria-hidden="true" /><span>{children}</span></h2>;
}
const themes = {
  tas: { image: 'thermal', color: '#dfbd83', label: '热环境', tint: 'warm' },
  huss: { image: 'moisture', color: '#85cbbf', label: '水汽条件', tint: 'water' },
  sfcwind: { image: 'wind', color: '#96c4e0', label: '近地表风场', tint: 'wind' },
  rsds: { image: 'solar', color: '#e7bc7a', label: '太阳辐射', tint: 'solar' },
};

export function Sparkline({ values, active, color = '#82c8b8' }: { values: (number | null)[]; active?: number; color?: string }) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!finite.length) return <span className="spark-empty">无样本</span>;
  const low = Math.min(...finite), span = Math.max(Math.max(...finite) - low, 0.001);
  const coordinates = values.map((value, i) => value == null ? null : [3 + i / Math.max(1, values.length - 1) * 134, 32 - (value - low) / span * 26]);
  const path = coordinates.map((point, i) => point ? `${i === 0 || !coordinates[i - 1] ? 'M' : 'L'}${point[0]},${point[1]}` : '').join(' ');
  const point = active == null ? null : coordinates[active];
  return <svg className="sparkline" viewBox="0 0 140 38" aria-hidden="true">
    <path d={path} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    {point && <><line x1={point[0]} y1="0" x2={point[0]} y2="38" stroke={color} opacity=".22" /><circle cx={point[0]} cy={point[1]} r="3" fill={color} stroke="#10272b" strokeWidth="1.5" /></>}
  </svg>;
}

export function ThemeCard({ data, evolution, variable, mode, year, province, active, onSelect }: InsightProps & { variable: keyof typeof themes; active: boolean; onSelect: () => void }) {
  const metric = useMemo(() => regionInsight(data, evolution, variable, mode, year, province), [data, evolution, variable, mode, year, province]);
  const theme = themes[variable];
  const units = data.variables[variable].unit.replace('W/m2', 'W/m²');
  return <article className={`weather-card ${theme.tint} ${active ? 'active' : ''}`} style={{ '--weather-accent': theme.color } as CSSProperties} aria-label={`${SHORT_NAMES[variable]}主题卡`}>
    <button className="weather-select" onClick={onSelect} aria-pressed={active} aria-label={`查看${SHORT_NAMES[variable]}空间分布`}>
      <span className="weather-photo" aria-hidden="true">
        <Image src={`/images/weather/${theme.image}.png`} alt="" fill sizes="(min-width: 1900px) 200px, 160px" />
      </span>
      <span className="weather-copy">
        <span className="weather-name"><ChevronsRight className="theme-arrow" size={13} aria-hidden="true" />{theme.label}<small>{data.variables[variable].name}</small></span>
        <span className="weather-value" key={`${mode}-${year}-${province?.name}`}><strong>{fmt(metric.value)}</strong><em>{units}{mode === 'trend' ? '/10年' : ''}</em></span>
      </span>
    </button>
    <div className="weather-facts">
      <span>{mode === 'annual' ? '较上年' : '较沿海整体'}<b className={(mode === 'annual' ? metric.delta : metric.deviation) == null ? '' : (mode === 'annual' ? metric.delta! : metric.deviation!) >= 0 ? 'value-up' : 'value-down'}>{mode === 'annual' && year === 2021 ? '无上年数据' : signedNumber(mode === 'annual' ? metric.delta : metric.deviation)}</b></span>
      <span>{province ? '省份排序' : mode === 'annual' ? '较十年均值' : '有样本省份'}<b>{province ? metric.rank == null ? '无样本' : `${metric.rank} / ${metric.ranking.length}` : mode === 'annual' ? signedNumber(metric.deviation) : `${metric.ranking.length} 个`}</b></span>
    </div>
    <div className="weather-history"><Sparkline values={metric.series} active={mode === 'annual' ? evolution.years.indexOf(year) : undefined} color={theme.color} /><span>2021-2030 年均轨迹</span></div>
  </article>;
}

export function ProvinceRanking(props: InsightProps & { onSelect: (name: string) => void }) {
  const { data, evolution, variable, mode, year, province, onSelect } = props;
  const insight = useMemo(() => regionInsight(data, evolution, variable, mode, year, province), [data, evolution, variable, mode, year, province]);
  const rows = useMemo(() => insight.ranking.map(row => {
    const series = annualSeries(data, evolution, variable, row.province), yi = evolution.years.indexOf(year);
    const delta = yi > 0 && series[yi] != null && series[yi - 1] != null ? series[yi]! - series[yi - 1]! : null;
    return { ...row, series, delta };
  }), [insight.ranking, data, evolution, variable, year]);
  return <section className="panel ranking-panel" aria-label="沿海省份对比榜">
    <div className="panel-heading"><SectionTitle>沿海省份对比</SectionTitle></div>
    <div className="ranking-context">{SHORT_NAMES[variable]} <span>{mode === 'annual' ? `${year} 年` : mode === 'mean' ? '十年均值' : '十年变化率'} / {data.variables[variable].unit}{mode === 'trend' ? '/10年' : ''}</span></div>
    <div className="ranking-scroll" tabIndex={0} aria-label="省份排名列表，可滚动">
      <table><thead><tr><th>序</th><th>省份</th><th>数值</th><th>{mode === 'annual' ? '较上年' : '样本数'}</th><th className="rank-spark">年均轨迹</th></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.province.name} className={province?.name === row.province.name ? 'selected' : ''}>
          <td>{String(i + 1).padStart(2, '0')}</td><td><button onClick={() => onSelect(row.province.name)} aria-pressed={province?.name === row.province.name} title={`选择${row.province.name}，保持地图视角`}>{shortProvince(row.province.name)}</button></td>
          <td>{fmt(row.stats.value)}</td><td>{mode === 'annual' ? row.delta == null ? <span aria-label="无上年数据">-</span> : <span className={`rank-change ${Number(row.delta.toFixed(3)) > 0 ? 'value-up' : Number(row.delta.toFixed(3)) < 0 ? 'value-down' : ''}`} title={`较上年${signedNumber(row.delta)} ${data.variables[variable].unit}`}>
            <span>{signedNumber(row.delta)}</span>{Number(row.delta.toFixed(3)) > 0 ? <ArrowUp size={14} aria-label="上升" /> : Number(row.delta.toFixed(3)) < 0 ? <ArrowDown size={14} aria-label="下降" /> : <Minus size={12} aria-label="持平" />}
          </span> : row.stats.count}</td>
          <td className="rank-spark"><Sparkline values={row.series} active={mode === 'annual' ? evolution.years.indexOf(year) : undefined} /></td>
        </tr>)}</tbody></table>
    </div>
  </section>;
}

export function RegionTrend({ data, evolution, variable, mode, year, province }: InsightProps) {
  const comparison = useMemo(() => {
    if (province) {
      const region = annualSeries(data, evolution, variable, province), all = annualSeries(data, evolution, variable, null);
      return { labels: [shortProvince(province.name), '沿海整体'], colors: ['#e2bf81', '#82c9b9'], rows: evolution.years.map((year, i) => ({ year, a: region[i], b: all[i] })) };
    }
    const zones = [
      data.grid.map((point, i) => point.lat >= 35 ? i : -1).filter(i => i >= 0),
      data.grid.map((point, i) => point.lat >= 25 && point.lat < 35 ? i : -1).filter(i => i >= 0),
      data.grid.map((point, i) => point.lat < 25 ? i : -1).filter(i => i >= 0),
    ];
    return { labels: ZONES, colors: ZONE_COLORS, rows: evolution.years.map((year, i) => ({ year,
      ...Object.fromEntries(zones.map((indices, j) => [['a', 'b', 'c'][j], provinceStats(data.grid, evolution.annual[variable][i], { name: ZONES[j], number: j, indices })?.value ?? null])),
    })) };
  }, [data, evolution, variable, province]);
  return <section className="panel trend-panel">
    <div className="panel-heading"><SectionTitle>{province ? '区域与整体对比' : '沿海分区年际变化'}</SectionTitle><TrendingUp size={16} /></div>
    <div className="chart-legend">{comparison.labels.map((label, i) => <span key={label}><i style={{ background: comparison.colors[i] }} />{label}</span>)}<small>{data.variables[variable].unit}</small></div>
    <div className="comparison-chart"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={comparison.rows} margin={{ top: 10, right: 14, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="rgba(154,188,184,.10)" vertical={false} />
        <XAxis dataKey="year" stroke="#91aaa5" tickLine={false} axisLine={false} minTickGap={22} />
        <YAxis stroke="#a8c0b6" tickLine={false} axisLine={false} width={54} domain={['auto', 'auto']} tickFormatter={value => fmt(Number(value), 1)} />
        <Tooltip contentStyle={{ background: '#10272d', border: '1px solid #365653', borderRadius: 10, color: '#e6f1ed' }} formatter={(value, name) => [`${fmt(Number(value), 3)} ${data.variables[variable].unit}`, String(name)]} labelFormatter={label => `${label} 年`} />
        {mode === 'annual' && <ReferenceLine x={year} stroke="#c4d5b9" strokeDasharray="3 4" />}
        {comparison.labels.map((label, i) => <Line key={label} name={label} dataKey={['a', 'b', 'c'][i]} stroke={comparison.colors[i]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer></div>
    {province && !province.indices.length && <p className="panel-footnote">该省无沿海样本，仅展示整体参考线</p>}
  </section>;
}

export function YearMonthMatrix({ monthly, error, name, variable, unit, year, mode, onYear }: { monthly: MonthlyData | null; error: string; name: string; variable: VariableKey; unit: string; year: number; mode: MapMode; onYear: (year: number) => void }) {
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [hover, setHover] = useState<{ year: number; month: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const pickerControl = useRef<HTMLDivElement>(null);
  const pickerTrigger = useRef<HTMLButtonElement>(null);
  const pickerSelect = useRef<HTMLSelectElement>(null);
  const pickerId = useId();
  const rows = monthly?.regions[name]?.monthly[variable] ?? [];
  const values = rows.flat().filter((v): v is number => v != null);
  const [lo, hi] = valueRange(values);
  const activeDate = hover ?? { year, month: selectedMonth };
  const activeValue = monthly ? rows[monthly.years.indexOf(activeDate.year)]?.[activeDate.month] : null;
  const showPicker = pickerOpen && values.length > 0;
  useEffect(() => {
    if (!showPicker) return;
    pickerSelect.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerControl.current?.contains(event.target)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [showPicker]);
  const selectMonth = (selectedYear: number, month: number) => {
    setSelectedMonth(month);
    setHover(null);
    onYear(selectedYear);
  };
  return <section className={`panel matrix-panel ${values.length ? 'has-data' : ''}`} aria-label="年月热力矩阵">
    <div className="panel-heading"><SectionTitle>年月热力矩阵</SectionTitle>
      <div className="month-picker-control" ref={pickerControl}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPickerOpen(false); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setPickerOpen(false); pickerTrigger.current?.focus(); } }}>
        <button ref={pickerTrigger} className="month-picker-trigger" aria-label="选择年月" aria-haspopup="dialog" aria-expanded={showPicker} aria-controls={showPicker ? pickerId : undefined} disabled={!values.length}
          title="选择 2021-2030 年的月份" onClick={() => { setPickerYear(year); setPickerOpen(!showPicker); }}><CalendarDays size={19} /></button>
        {showPicker && <div id={pickerId} className="month-picker" role="dialog" aria-label="选择年月" aria-modal="false">
          <div className="month-picker-heading"><label>年份<select ref={pickerSelect} aria-label="月份选择器年份" value={pickerYear} onChange={event => setPickerYear(Number(event.target.value))}>
            {monthly!.years.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select></label><button aria-label="关闭月份选择器" onClick={() => { setPickerOpen(false); pickerTrigger.current?.focus(); }}><X size={16} /></button></div>
          <div className="month-options">{Array.from({ length: 12 }, (_, month) => <button key={month} disabled={rows[monthly!.years.indexOf(pickerYear)]?.[month] == null}
            aria-label={`选择${pickerYear}年${month + 1}月`} aria-pressed={pickerYear === year && month === selectedMonth}
            onClick={() => { selectMonth(pickerYear, month); setPickerOpen(false); pickerTrigger.current?.focus(); }}>{month + 1} 月</button>)}</div>
        </div>}
      </div>
    </div>
    <div className="matrix-context"><span>{name === ALL_COAST ? '沿海整体' : shortProvince(name)} / {SHORT_NAMES[variable]}</span><span>月平均 · {unit}</span></div>
    {!monthly ? <div className="insight-empty" role={error ? 'alert' : 'status'}>{error || '正在读取月度统计…'}</div> : !values.length ? <div className="insight-empty">该省暂无沿海样本</div> : <>
      <div className="matrix-grid" role="group" aria-label="点击月份单元格切换到对应年份" onMouseLeave={() => setHover(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null); }}>
        <span className="matrix-axis">年/月</span>{Array.from({ length: 12 }, (_, i) => <span key={i} className="matrix-axis">{i + 1}</span>)}
        {monthly.years.map((rowYear, yi) => <div className={`matrix-row ${mode === 'annual' && rowYear === year ? 'current' : ''}`} key={rowYear}>
          <button className="matrix-year" onClick={() => onYear(rowYear)} aria-label={`矩阵选择${rowYear}年`}>{rowYear}</button>
          {rows[yi]?.map((value, month) => <button key={month} className={`matrix-cell ${rowYear === year && month === selectedMonth ? 'selected-month' : ''}`} disabled={value == null}
            style={{ background: value == null ? '#183235' : matrixColor((value - lo) / (hi - lo)) }}
            title={`${rowYear}年${month + 1}月：${fmt(value, 3)} ${unit}`}
            aria-label={`${rowYear}年${month + 1}月 ${fmt(value, 3)} ${unit}`} aria-pressed={rowYear === year && month === selectedMonth}
            onMouseMove={() => setHover(previous => previous?.year === rowYear && previous.month === month ? previous : { year: rowYear, month })} onFocus={() => setHover({ year: rowYear, month })} onClick={() => selectMonth(rowYear, month)} />)}
        </div>)}
      </div>
      <div className="matrix-readout" aria-label="月度读数"><span>{activeDate.year} 年 {activeDate.month + 1} 月</span><strong>{fmt(activeValue ?? null, 3)} <small>{unit}</small></strong></div>
      <div className="matrix-scale"><span>{fmt(lo, 1)}</span><i style={{ background: `linear-gradient(90deg, ${heatStops.join(',')})` }} /><span>{fmt(hi, 1)}</span><small>本区域十年统一色标</small></div>
    </>}
  </section>;
}

export function SeasonalSummary({ monthly, error, name, variable, unit, year, mode }: { monthly: MonthlyData | null; error: string; name: string; variable: VariableKey; unit: string; year: number; mode: MapMode }) {
  const annual = mode === 'annual';
  const rows = monthly ? seasonalProfile(monthly, name, variable, year, annual) : [];
  const reference = monthly ? seasonalProfile(monthly, ALL_COAST, variable, year, name === ALL_COAST ? false : annual) : [];
  const showReference = name !== ALL_COAST || annual;
  const profile = monthly ? monthlyProfile(monthly, name, variable, year, annual) : [];
  const finite = rows.map(row => row.value).filter((v): v is number => v != null);
  const max = Math.max(1, ...finite.map(Math.abs), ...reference.map(row => Math.abs(row.value ?? 0)));
  const peak = profile.reduce<number>((best, value, index) => value != null && (best < 0 || value > profile[best]!) ? index : best, -1);
  return <section className="panel season-summary">
    <div className="panel-heading"><SectionTitle>季节特征</SectionTitle><Layers3 size={16} /></div>
    <div className="season-context">{annual ? `${year} 年` : '2021-2030 平均'}<span>{unit}</span></div>
    {!monthly ? <div className="insight-empty">{error || '正在读取季节统计…'}</div> : !finite.length ? <div className="insight-empty">该省暂无沿海样本</div> : <>
      <div className="season-rows">{rows.map((row, i) => <div key={row.season} className="season-row">
        <span>{row.season}</span><div className="season-bar-area">{showReference && <i style={{ transform: `scaleX(${Math.abs(reference[i]?.value ?? 0) / max})` }} />}<b className={row.value != null && row.value < 0 ? 'negative' : ''} style={{ transform: `scaleX(${Math.abs(row.value ?? 0) / max})` }} /></div><strong>{fmt(row.value)}</strong>
      </div>)}</div>
      <div className="season-note"><span><i />当前区域 {showReference && <><i className="reference" />{name === ALL_COAST ? '十年均值' : '沿海整体'}</>}</span><span>{peak >= 0 ? `${peak + 1} 月月均值最高` : ''}</span></div>
    </>}
  </section>;
}
