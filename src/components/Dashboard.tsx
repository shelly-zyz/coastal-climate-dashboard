"use client";

import {
  Activity,
  Download,
  Droplets,
  Gauge,
  Play,
  Pause,
  RotateCcw,
  X,
  Radio,
  Sun,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dynamic from "next/dynamic";

const ChinaMap3D = dynamic(() => import("./ChinaMap3D"), { ssr: false });

import { frameValues, heatStops, trendStops, valueRange, provinceStats, type EvolutionData, type GridRow, type MapMode, type VariableKey } from "../lib/climate-map";

type VariableSummary = {
  name: string;
  unit: string;
  mean: number;
  p10: number;
  median: number;
  p90: number;
  min: number;
  max: number;
  trend: number;
  pValue: number;
  r2: number;
};

type SeriesRow = { variable: VariableKey; year?: number; month?: number; season?: string; zone?: string; value: number };

type DashboardData = {
  meta: {
    recordId: string;
    model: string;
    scenario: string;
    period: string;
    coastalWidthKm: number;
    gridCount: number;
    validLandGridCount: number;
    generatedAt: string;
  };
  variables: Record<VariableKey, VariableSummary>;
  annual: SeriesRow[];
  monthly: SeriesRow[];
  seasonal: SeriesRow[];
  grid: GridRow[];
};

const variableOrder: VariableKey[] = ["tas", "huss", "rsds", "sfcwind", "ps"];
const variableIcons = {
  tas: Thermometer,
  huss: Droplets,
  rsds: Sun,
  sfcwind: Wind,
  ps: Gauge,
};
const variableShort = { tas: "气温", huss: "比湿", rsds: "短波辐射", sfcwind: "风速", ps: "气压" };
const zoneColors: Record<string, string> = {
  "北部沿海（≥35°N）": "#83b6d4",
  "中部沿海（25–35°N）": "#d7ad68",
  "南部沿海（<25°N）": "#6fbea7",
};
const chartTooltipStyle = {
  background: "rgba(13, 31, 36, .96)",
  border: "1px solid rgba(145, 187, 181, .22)",
  borderRadius: 12,
  boxShadow: "0 14px 38px rgba(0, 12, 16, .3)",
};
const fmt = (value: number, digits = 2) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [variable, setVariable] = useState<VariableKey>("tas");
  const [mapMode, setMapMode] = useState<MapMode>("annual");
  const [evolution, setEvolution] = useState<EvolutionData | null>(null);
  const [evolutionError, setEvolutionError] = useState("");
  const [year, setYear] = useState(2021);
  const [playing, setPlaying] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [provinceFocus, setProvinceFocus] = useState<{ name: string | null; sequence: number } | null>(null);
  const [speed, setSpeed] = useState(1800);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/climate-evolution.json", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("年度空间数据暂不可用"); return response.json(); })
      .then(setEvolution)
      .catch((error) => { if (error.name !== "AbortError") setEvolutionError(String(error)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!playing || mapMode !== "annual" || !evolution) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setYear((previous) => previous >= 2030 ? 2021 : previous + 1);
    }, speed);
    return () => window.clearInterval(timer);
  }, [playing, mapMode, evolution, speed]);

  const chooseMode = (mode: MapMode) => { setPlaying(false); setMapMode(mode); };
  const queryProvince = (name: string | null) => {
    setSelectedProvince(name);
    setProvinceFocus((previous) => ({ name, sequence: (previous?.sequence ?? 0) + 1 }));
  };

  useEffect(() => {
    fetch("/data/climate-dashboard.json")
      .then((response) => {
        if (!response.ok) throw new Error("分析数据未生成");
        return response.json();
      })
      .then(setData)
      .catch((reason) => setError(String(reason)));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return { annual: [], monthly: [], seasonal: [] };
    const annual = data.annual.filter((row) => row.variable === variable);
    const monthlyByMonth = Array.from({ length: 12 }, (_, i) => ({ month: `${i + 1}月` })) as Array<Record<string, string | number>>;
    data.monthly.filter((row) => row.variable === variable).forEach((row) => {
      monthlyByMonth[(row.month ?? 1) - 1][row.zone ?? ""] = row.value;
    });
    const seasonalBySeason = ["冬季", "春季", "夏季", "秋季"].map((season) => ({ season })) as Array<Record<string, string | number>>;
    data.seasonal.filter((row) => row.variable === variable).forEach((row) => {
      const target = seasonalBySeason.find((item) => item.season === row.season);
      if (target) target[row.zone ?? ""] = row.value;
    });
    return { annual, monthly: monthlyByMonth, seasonal: seasonalBySeason };
  }, [data, variable]);

  if (error) {
    return <main className="center-state"><Zap size={28} /><h1>数据接入未完成</h1><p>{error}</p></main>;
  }
  if (!data) {
    return <main className="center-state"><Radio className="pulse" size={28} /><h1>正在接入沿海气候数据流</h1><p>读取 2021-2030 逐小时统计结果...</p></main>;
  }

  const current = data.variables[variable];
  const values = frameValues(data.grid, evolution, variable, mapMode, year);
  // Annual playback uses one fixed scale across all ten years, not per-frame rescaling.
  const [lo, hi] = valueRange(mapMode === "annual" ? evolution?.annual[variable].flat() ?? [] : values, mapMode === "trend");
  const province = evolution?.provinces.find((item) => item.name === selectedProvince) ?? null;
  const stats = provinceStats(data.grid, values, province);
  const displayedMean = mapMode === "annual" ? data.annual.find((row) => row.variable === variable && row.year === year)?.value : mapMode === "mean" ? current.mean : current.trend;
  const periodLabel = mapMode === "annual" ? year + " 年" : mapMode === "mean" ? "2021-2030 平均" : "2021-2030 变化率";
  const unit = current.unit + (mapMode === "trend" ? " / 10年" : "");

  return (
    <main className="dashboard-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="topbar reveal">
        <div className="brand-mark"><Zap size={20} fill="currentColor" /></div>
        <div className="title-block">
          <span className="eyebrow">沿海电力气候智能分析</span>
          <h1>中国沿海气象 · 电力气候态势大屏</h1>
        </div>
        <div className="topbar-meta">
          <span className="status-pill"><i /> 数据就绪</span>
          <span className="clock">{formatDateTime(data.meta.generatedAt)}</span>
        </div>
      </header>

      <section className="kpi-strip reveal delay-1" aria-label="气象要素概览">
        {variableOrder.map((key) => {
          const item = data.variables[key];
          const Icon = variableIcons[key];
          const active = key === variable;
          return (
            <button key={key} className={`kpi ${active ? "active" : ""}`} aria-pressed={active} onClick={() => setVariable(key)}>
              <span className="kpi-icon"><Icon size={19} /></span>
              <span className="kpi-copy"><small>{item.name}</small><strong>{fmt(item.mean)} <em>{item.unit}</em></strong></span>
              <span className={`trend-chip ${item.trend >= 0 ? "up" : "down"}`}>{item.trend >= 0 ? "+" : ""}{fmt(item.trend, 3)} /10年</span>
            </button>
          );
        })}
      </section>

      <div className="dashboard-grid">
        <section className="panel map-panel reveal delay-3">
          <div className="panel-heading">
            <div><h2>沿海气象空间场</h2></div>
            <div className="segmented" aria-label="地图模式">
              <button className={mapMode === "annual" ? "selected" : ""} aria-pressed={mapMode === "annual"} onClick={() => chooseMode("annual")}>年度演变</button>
              <button className={mapMode === "mean" ? "selected" : ""} aria-pressed={mapMode === "mean"} onClick={() => chooseMode("mean")}>十年均值</button>
              <button className={mapMode === "trend" ? "selected" : ""} aria-pressed={mapMode === "trend"} onClick={() => chooseMode("trend")}>变化率</button>
            </div>
          </div>
          <div className="map-readout">
            <div><span>{current.name} · {periodLabel}</span><strong>{displayedMean === undefined ? "数据加载中" : fmt(displayedMean, 3)} <small>{unit}</small></strong></div>
            <label className="province-select">省份查询
              <select aria-label="选择省份" title="选择省份并定位地图" value={selectedProvince ?? ""} onChange={(event) => queryProvince(event.target.value || null)} disabled={!evolution}>
                <option value="">点击地图或选择省份</option>
                {evolution?.provinces.map((item) => <option key={item.name} value={item.name}>{String(item.number).padStart(2, "0")} {item.name}</option>)}
              </select>
            </label>
          </div>
          <div className="map-stage">
            <ChinaMap3D points={data.grid} values={values} mode={mapMode} low={lo} high={hi}
              selectedProvince={selectedProvince} onProvinceSelect={setSelectedProvince} focusRequest={provinceFocus} />
            <div className="map-legend">
              <span>{fmt(lo)}</span><i style={{ background: "linear-gradient(90deg," + (mapMode === "trend" ? trendStops : heatStops).join(",") + ")" }} /><span>{fmt(hi)} {unit}</span>
              {mapMode === "annual" && <small>十年固定色标</small>}
            </div>
            {selectedProvince && <section className="province-inspector" aria-label="省份统计">
              <button aria-label="关闭省份统计" onClick={() => setSelectedProvince(null)}><X size={14} /></button>
              <span>{String(province?.number ?? "").padStart(2, "0")} · {selectedProvince}</span>
              <strong>{stats ? fmt(stats.value, 3) : "无沿海样本"} {stats && <small>{unit}</small>}</strong>
              <p>{stats ? periodLabel + " · 省内沿海网格面积加权" : "本研究数据未覆盖该省份的沿海网格"}</p>
              {stats && <p>{stats.count} 个网格 · 范围 {fmt(stats.min)}—{fmt(stats.max)}</p>}
            </section>}
          </div>
          <div className="map-playback">
            {mapMode === "annual" ? evolution ? <>
              <div className="playback-top">
                <button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? "暂停年度演变" : "播放年度演变"}>{playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "暂停" : "播放演变"}</button>
                <strong className="active-year">{year}<small>年</small></strong>
                <button className="reset-playback" aria-label="回到2021年" onClick={() => { setPlaying(false); setYear(2021); }}><RotateCcw size={14} /></button>
                <label className="speed-label">速度<select aria-label="播放速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={3000}>慢速</option><option value={1800}>标准</option><option value={900}>快速</option></select></label>
              </div>
              <input className="year-range" type="range" min={2021} max={2030} step={1} value={year} aria-label="演变年份" onChange={(event) => { setPlaying(false); setYear(Number(event.target.value)); }} />
              <div className="year-ticks">{evolution.years.map((item) => <button key={item} aria-label={"选择" + item + "年"} aria-pressed={item === year} onClick={() => { setPlaying(false); setYear(item); }}>{item}</button>)}</div>
            </> : <p role={evolutionError ? "alert" : "status"}>{evolutionError || "正在读取逐年空间数据…"}</p> :
              <p className="static-map-caption">{mapMode === "mean" ? "2021-2030 十年气候态" : "2021-2030 网格线性变化率"} · 点击省份查看区域数值</p>}
          </div>
        </section>

        <aside className="panel signal-panel reveal delay-4">
          <div className="panel-heading"><div><h2>变化信号</h2></div><Activity size={19} /></div>
          <div className="signal-hero">
            <span>沿海整体变化率</span>
            <strong>{current.trend >= 0 ? "+" : ""}{fmt(current.trend, 3)}</strong>
            <small>{current.unit} / 10年</small>
          </div>
          <div className="confidence-track"><span style={{ width: `${Math.min(100, Math.max(8, (1 - current.pValue) * 100))}%` }} /></div>
          <div className="signal-row"><span>显著性 p 值</span><strong>{current.pValue.toFixed(3)}</strong></div>
          <div className="signal-row"><span>拟合 R²</span><strong>{current.r2.toFixed(3)}</strong></div>
          <div className="signal-row"><span>空间 P10-P90</span><strong>{fmt(current.p10)}-{fmt(current.p90)}</strong></div>
        </aside>

        <section className="panel chart-panel annual-panel reveal delay-4">
          <div className="panel-heading"><div><h2>{variableShort[variable]}年际轨迹</h2></div><span className="unit-tag">{current.unit}</span></div>
          <div className="chart-body"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.annual} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(154,188,184,.09)" vertical={false} />
              <XAxis dataKey="year" stroke="#77918f" tickLine={false} axisLine={false} />
              <YAxis stroke="#77918f" tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => [`${fmt(Number(value), 3)} ${current.unit}`, current.name]} />
              {mapMode === "annual" && <ReferenceLine x={year} stroke="#d7ad68" strokeDasharray="3 4" />}
              <Line type="monotone" dataKey="value" stroke="#79c8bc" strokeWidth={2.2} dot={{ r: 2.8, fill: "#102126", strokeWidth: 1.6 }} activeDot={{ r: 4.5, fill: "#d7ad68" }} />
            </LineChart>
          </ResponsiveContainer></div>
        </section>

        <section className="panel chart-panel monthly-panel reveal delay-5">
          <div className="panel-heading"><div><h2>沿海分区月度节律</h2></div><span className="unit-tag">{current.unit}</span></div>
          <div className="inline-legend">{Object.entries(zoneColors).map(([zone, color]) => <span key={zone}><i style={{ background: color }} />{zone.split("（")[0]}</span>)}</div>
          <div className="chart-body"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.monthly} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(154,188,184,.09)" vertical={false} />
              <XAxis dataKey="month" stroke="#77918f" tickLine={false} axisLine={false} />
              <YAxis stroke="#77918f" tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => `${fmt(Number(value), 2)} ${current.unit}`} />
              {Object.entries(zoneColors).map(([zone, color]) => <Line key={zone} type="monotone" dataKey={zone} stroke={color} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer></div>
        </section>

        <section className="panel chart-panel seasonal-panel reveal delay-5">
          <div className="panel-heading"><div><h2>季节分区对比</h2></div><span className="unit-tag">{current.unit}</span></div>
          <div className="chart-body"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.seasonal} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(154,188,184,.09)" vertical={false} />
              <XAxis dataKey="season" stroke="#77918f" tickLine={false} axisLine={false} />
              <YAxis stroke="#77918f" tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} />
              <Tooltip cursor={{ fill: "rgba(121,200,188,.05)" }} contentStyle={chartTooltipStyle} formatter={(value) => `${fmt(Number(value), 2)} ${current.unit}`} />
              <ReferenceLine y={0} stroke="#395564" />
              {Object.entries(zoneColors).map(([zone, color]) => <Bar key={zone} dataKey={zone} fill={color} radius={[2, 2, 0, 0]} />)}
            </BarChart>
          </ResponsiveContainer></div>
        </section>
      </div>

      <footer className="footer reveal delay-5">
        <div><span>数据来源</span><strong>Zenodo {data.meta.recordId} · CC BY 4.0</strong><small>MPI-ESM1-2-HR / SSP2-4.5 · 小时级原始数据 → 日均 → 面积加权统计</small></div>
        <nav aria-label="结果下载">
          <a href="/downloads/coastal_grid_climatology_and_trends.csv" download><Download size={15} />空间网格 CSV</a>
          <a href="/downloads/coastal_annual_series.csv" download><Download size={15} />年度序列 CSV</a>
          <a href="/downloads/coastal_monthly_climatology.csv" download><Download size={15} />月气候态 CSV</a>
        </nav>
      </footer>
    </main>
  );
}
