"use client";

import {
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
import dynamic from "next/dynamic";

const ChinaMap3D = dynamic(() => import("./ChinaMap3D"), { ssr: false });

import { frameValues, heatStops, trendStops, valueRange, provinceStats, type EvolutionData, type MapMode, type VariableKey } from "../lib/climate-map";
import { ALL_COAST, regionInsight, SHORT_NAMES, signedNumber, type DashboardData, type MonthlyData } from "../lib/climate-insights";
import { ProvinceRanking, RegionTrend, SeasonalSummary, SectionTitle, ThemeCard, YearMonthMatrix } from "./ClimateInsights";

const variableOrder: VariableKey[] = ["tas", "huss", "rsds", "sfcwind", "ps"];
const variableIcons = {
  tas: Thermometer,
  huss: Droplets,
  rsds: Sun,
  sfcwind: Wind,
  ps: Gauge,
};
const fmt = (value: number, digits = 2) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);

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
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);
  const [monthlyError, setMonthlyError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/climate-monthly.json', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('月度统计加载失败，请刷新重试'); return response.json(); })
      .then(setMonthly).catch(error => { if (error.name !== 'AbortError') setMonthlyError(error.message); });
    return () => controller.abort();
  }, []);

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
  const chooseYear = (value: number) => { setPlaying(false); setMapMode('annual'); setYear(value); };
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

  const province = evolution?.provinces.find(item => item.name === selectedProvince) ?? null;
  const insights = useMemo(() => data && evolution ? Object.fromEntries(variableOrder.map(key => [key, regionInsight(data, evolution, key, mapMode, year, province)])) as Record<VariableKey, ReturnType<typeof regionInsight>> : null, [data, evolution, mapMode, year, province]);
  const values = useMemo(() => data ? frameValues(data.grid, evolution, variable, mapMode, year) : [], [data, evolution, variable, mapMode, year]);

  if (error || evolutionError) {
    return <main className="center-state"><Zap size={28} /><h1>数据接入未完成</h1><p>{error || evolutionError}</p></main>;
  }
  if (!data || !evolution || !insights) {
    return <main className="center-state"><Radio className="pulse" size={28} /><h1>正在加载气象数据</h1><p>读取 2021-2030 年统计结果...</p></main>;
  }

  const current = data.variables[variable];
  // Annual playback uses one fixed scale across all ten years, not per-frame rescaling.
  const [lo, hi] = valueRange(mapMode === "annual" ? evolution?.annual[variable].flat() ?? [] : values, mapMode === "trend");
  const stats = provinceStats(data.grid, values, province);
  const displayedMean = insights[variable].value;
  const periodLabel = mapMode === "annual" ? year + " 年" : mapMode === "mean" ? "2021-2030 平均" : "2021-2030 变化率";
  const unit = current.unit + (mapMode === "trend" ? " / 10年" : "");
  const scope = selectedProvince ?? ALL_COAST;
  const insightProps = { data, evolution, variable, mode: mapMode, year, province };

  return (
    <main className="dashboard-shell">
      <header className="topbar reveal">
        <div className="brand-mark" role="img" aria-label="沿海气象标识"><Zap size={27} fill="currentColor" aria-hidden="true" /></div>
        <div className="title-block">
          <h1>中国沿海气象可视化大屏</h1>
        </div>
      </header>

      <section className="metric-toolbar reveal delay-1" aria-label="气象要素概览">
        {variableOrder.map((key) => {
          const item = data.variables[key];
          const Icon = variableIcons[key];
          const active = key === variable;
          return (
            <button key={key} data-variable={key} className={`metric-tab ${active ? "active" : ""}`} aria-pressed={active} onClick={() => setVariable(key)} aria-label={`切换${SHORT_NAMES[key]}`}>
              <span className="metric-symbol" aria-hidden="true"><Icon size={21} /></span><span className="metric-label">{SHORT_NAMES[key]}</span><strong>{insights[key].value == null ? '无样本' : fmt(insights[key].value!)}</strong><small>{item.unit.replace('W/m2', 'W/m²')}{mapMode === 'trend' ? '/10年' : ''}</small>
            </button>
          );
        })}
      </section>

      <div className="scope-strip"><span><b>{scope}</b><i />{periodLabel}{mapMode === 'annual' ? '平均' : ''}</span>{selectedProvince && <button onClick={() => setSelectedProvince(null)}><X size={14} />清除区域选择</button>}</div>

      <div className="dashboard-grid">
        <aside className="insight-column left-insights">
          <div className="theme-pair" aria-label="热环境与水汽"><ThemeCard {...insightProps} variable="tas" active={variable === 'tas'} onSelect={() => setVariable('tas')} /><ThemeCard {...insightProps} variable="huss" active={variable === 'huss'} onSelect={() => setVariable('huss')} /></div>
          <ProvinceRanking {...insightProps} onSelect={setSelectedProvince} />
          <RegionTrend {...insightProps} />
        </aside>
        <section className="panel map-panel reveal delay-3">
          <div className="panel-heading">
            <div><SectionTitle>沿海气象空间场</SectionTitle></div>
            <div className="segmented" aria-label="地图模式">
              <button className={mapMode === "annual" ? "selected" : ""} aria-pressed={mapMode === "annual"} onClick={() => chooseMode("annual")}>年度演变</button>
              <button className={mapMode === "mean" ? "selected" : ""} aria-pressed={mapMode === "mean"} onClick={() => chooseMode("mean")}>十年均值</button>
              <button className={mapMode === "trend" ? "selected" : ""} aria-pressed={mapMode === "trend"} onClick={() => chooseMode("trend")}>变化率</button>
            </div>
          </div>
          <div className="map-readout">
            <div><span>{scope} / {SHORT_NAMES[variable]}</span><strong>{displayedMean == null ? "无沿海样本" : fmt(displayedMean, 3)} <small>{unit}</small></strong></div>
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
              {stats && <p>{stats.count} 个网格 · 范围 {fmt(stats.min)}-{fmt(stats.max)}</p>}
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
              <p className="static-map-caption">{mapMode === "mean" ? "2021-2030 十年气候态" : "2021-2030 网格线性变化率"}</p>}
          </div>
          <div className="map-context-stats"><div><span>当前区域网格范围</span><strong>{insights[variable].stats ? `${fmt(insights[variable].stats!.min)} - ${fmt(insights[variable].stats!.max)}` : '无样本'} <small>{unit}</small></strong></div><div><span>区域线性变化率</span><strong>{signedNumber(insights[variable].trend, 3)} <small>{current.unit}/10年</small></strong></div></div>
        </section>

        <aside className="insight-column right-insights">
          <div className="theme-pair" aria-label="风与太阳辐射"><ThemeCard {...insightProps} variable="sfcwind" active={variable === 'sfcwind'} onSelect={() => setVariable('sfcwind')} /><ThemeCard {...insightProps} variable="rsds" active={variable === 'rsds'} onSelect={() => setVariable('rsds')} /></div>
          <YearMonthMatrix monthly={monthly} error={monthlyError} name={scope} variable={variable} unit={current.unit} year={year} mode={mapMode} onYear={chooseYear} />
          <SeasonalSummary monthly={monthly} error={monthlyError} name={scope} variable={variable} unit={current.unit} year={year} mode={mapMode} />
        </aside>
      </div>

      <footer className="footer reveal delay-5">
        <div className="source-summary"><strong>Zenodo {data.meta.recordId} · CC BY 4.0</strong><details className="data-notes"><summary>数据说明</summary><div>
          <p>MPI-ESM1-2-HR / SSP2-4.5，2021-2030 年气候情景数据，不是实时观测。</p>
          <p>区域数值由沿海网格面积加权计算；省份对比只包含有沿海样本的省级区域。</p>
          <p>冬季按当年 1、2、12 月统计；季节横条长度为绝对值，负值保留负号。矩阵为月均值，点击月份切换年度地图的年份。</p>
          <p>主题图片为 AI 生成配图，不代表对应年份的监测画面。</p>
        </div></details></div>
        <nav aria-label="结果下载">
          <a href="/downloads/coastal_grid_climatology_and_trends.csv" download><Download size={15} />空间网格 CSV</a>
          <a href="/downloads/coastal_annual_series.csv" download><Download size={15} />年度序列 CSV</a>
          <a href="/downloads/coastal_monthly_climatology.csv" download><Download size={15} />月气候态 CSV</a>
        </nav>
      </footer>
    </main>
  );
}
