import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconActivity,
  IconAlertCircle,
  IconChartLine,
  IconCheck,
  IconClock,
  IconCloud,
  IconCpu,
  IconDatabase,
  IconExternalLink,
  IconHistory,
  IconLayoutDashboard,
  IconRefresh,
  IconTrendingUp,
} from '@tabler/icons-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import confetti from 'canvas-confetti';

const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

type TabValue = 'dashboard' | 'forecast' | 'history';

type RecommendationType = 'critical' | 'warning' | 'success' | 'info';

interface LiveData {
  timestamp: string;
  cpu: number;
  memory: number;
  web_status: number;
  response_time_ms: number;
  isSimulated: boolean;
}

interface HistoryData {
  time: string;
  cpu?: number;
  memory?: number;
  response_time_ms?: number;
}

interface ForecastPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

interface ForecastData {
  timestamp: string;
  cpu: ForecastPoint[];
  memory: ForecastPoint[];
  web: ForecastPoint[];
  isSimulated: boolean;
}

interface Recommendation {
  type: RecommendationType;
  title: string;
  message: string;
  confidence: number;
  actionable: boolean;
  timeToImpact: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function App() {
  const [live, setLive] = useState<LiveData | null>(null);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [activeTab, setActiveTab] = useState<TabValue>('dashboard');
  const [imageSalt, setImageSalt] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [liveRes, histRes, foreRes] = await Promise.all([
        fetch(`${API_BASE}/api/metrics/live`),
        fetch(`${API_BASE}/api/metrics/history`),
        fetch(`${API_BASE}/api/metrics/forecast`),
      ]);

      if (!liveRes.ok || !histRes.ok || !foreRes.ok) {
        throw new Error('The backend returned an unexpected response.');
      }

      const liveJson: LiveData = await liveRes.json();
      const histJson: HistoryData[] = await histRes.json();
      const foreJson: ForecastData = await foreRes.json();

      setLive(liveJson);
      setHistory(histJson);
      setForecast(foreJson);
      setImageSalt((prev) => prev + 1);
    } catch (err: unknown) {
      console.error('Fetch Error:', err);
      setError('Realtime telemetry is currently unavailable. Ryver is falling back to a graceful preview experience.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = window.setInterval(() => {
      fetchData();
    }, refreshInterval * 1000);
    return () => window.clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const healthScore = useMemo(() => {
    if (!live) return 100;

    let score = 100;

    if (live.cpu > 82) score -= 24;
    else if (live.cpu > 62) score -= 10;

    if (live.memory > 88) score -= 27;
    else if (live.memory > 72) score -= 12;

    if (live.web_status !== 200) score -= 18;
    if (live.response_time_ms > 1400) score -= 8;

    return clamp(score, 0, 100);
  }, [live]);

  useEffect(() => {
    if (!loading && healthScore === 100) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.9 },
        colors: ['#f97316', '#10b981', '#3b82f6'],
      });
    }
  }, [healthScore, loading]);

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!live) {
      return [
        {
          type: 'info',
          title: 'Preparing your insight stream',
          message: 'Ryver is gathering live telemetry so it can turn your system data into clear, useful guidance.',
          confidence: 100,
          actionable: false,
          timeToImpact: 'Now',
        },
      ];
    }

    const recs: Recommendation[] = [];
    const cpu = live.cpu ?? 0;
    const memory = live.memory ?? 0;
    const latency = live.response_time_ms ?? 0;
    const status = live.web_status ?? 0;

    if (cpu > 87) {
      recs.push({
        type: 'critical',
        title: 'CPU is spiking hard',
        message: 'Your processor is under sustained pressure. Close heavy apps or browser tabs now to reduce lag and keep the system responsive.',
        confidence: 96,
        actionable: true,
        timeToImpact: 'Immediate',
      });
    } else if (cpu > 68) {
      recs.push({
        type: 'warning',
        title: 'CPU load is climbing',
        message: 'Your machine is working harder than usual. A short cleanup or lighter workload will keep performance crisp.',
        confidence: 84,
        actionable: true,
        timeToImpact: '15–30 min',
      });
    }

    if (memory > 90) {
      recs.push({
        type: 'critical',
        title: 'RAM is approaching a wall',
        message: 'Memory is almost exhausted. Close idle apps and browser tabs immediately to avoid freezes or stalled work.',
        confidence: 98,
        actionable: true,
        timeToImpact: '5–10 min',
      });
    } else if (memory > 76) {
      recs.push({
        type: 'warning',
        title: 'Memory pressure is building',
        message: 'Your RAM is trending upward and could start slowing tasks soon. This is the right moment to trim background activity.',
        confidence: 82,
        actionable: true,
        timeToImpact: '20–40 min',
      });
    }

    if (status !== 200) {
      recs.push({
        type: 'warning',
        title: 'The monitored service is unstable',
        message: `The monitored cloud endpoint is returning ${status}. That often means an outage, a wake-up delay, or routing trouble is affecting your experience.`,
        confidence: 92,
        actionable: false,
        timeToImpact: 'Unknown',
      });
    } else if (latency > 1800) {
      recs.push({
        type: 'warning',
        title: 'Cloud response is lagging',
        message: 'The monitored app is responding slower than typical. If you are depending on it for work, it is worth monitoring for a few minutes.',
        confidence: 77,
        actionable: false,
        timeToImpact: 'Ongoing',
      });
    }

    if (forecast && forecast.cpu?.length && forecast.memory?.length) {
      const futureCpu = forecast.cpu[forecast.cpu.length - 1]?.yhat ?? 0;
      const futureMem = forecast.memory[forecast.memory.length - 1]?.yhat ?? 0;
      const cpuTrend = futureCpu - (forecast.cpu[0]?.yhat ?? futureCpu);
      const memTrend = futureMem - (forecast.memory[0]?.yhat ?? futureMem);

      if (futureCpu > 75 && cpuTrend > 10) {
        const estimate = Math.max(20, Math.round((75 - cpu) / Math.max(cpuTrend / 30, 0.25)));
        recs.push({
          type: 'warning',
          title: 'AI forecast: CPU will rise soon',
          message: `Ryver expects CPU load to climb into a risky zone in roughly ${estimate} minutes unless you reduce the workload.`,
          confidence: 79,
          actionable: true,
          timeToImpact: `~${estimate} min`,
        });
      }

      if (futureMem > 82 && memTrend > 4) {
        const estimate = Math.max(20, Math.round((82 - memory) / Math.max(memTrend / 30, 0.25)));
        recs.push({
          type: 'warning',
          title: 'AI forecast: memory pressure is approaching',
          message: `Ryver projects memory usage to become uncomfortable in about ${estimate} minutes. Clearing a few tabs now will make the next hour smoother.`,
          confidence: 74,
          actionable: true,
          timeToImpact: `~${estimate} min`,
        });
      }
    }

    if (recs.length === 0) {
      recs.push({
        type: 'success',
        title: 'Everything looks healthy',
        message: 'Your patterns are stable and there is no immediate action to take. Ryver is ready if anything turns.',
        confidence: 92,
        actionable: false,
        timeToImpact: 'N/A',
      });
    }

    return recs.slice(0, 3);
  }, [forecast, live]);

  const primaryRecommendation = recommendations[0] ?? null;

  const formatTime = (value: string) => {
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return value;
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.10),_transparent_30%),linear-gradient(135deg,_#050607_0%,_#0b0d10_100%)] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07090c]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/10 p-2.5">
              <IconActivity className="h-6 w-6 text-brand-orange" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Ryver</h1>
              <p className="text-xs text-zinc-400">Real-time system monitoring and AI forecasting</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {live?.isSimulated ? (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                <IconAlertCircle className="h-3.5 w-3.5" />
                Preview Mode
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <IconCheck className="h-3.5 w-3.5" />
                LiveTelemetry
              </span>
            )}

            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
              <IconClock className="h-3.5 w-3.5 text-zinc-400" />
              <select
                value={refreshInterval}
                onChange={(event) => setRefreshInterval(Number(event.target.value))}
                className="bg-transparent pr-1 outline-none"
              >
                <option value={5} className="bg-[#090b0f]">5s</option>
                <option value={15} className="bg-[#090b0f]">15s</option>
                <option value={30} className="bg-[#090b0f]">30s</option>
                <option value={60} className="bg-[#090b0f]">60s</option>
                <option value={0} className="bg-[#090b0f]">Paused</option>
              </select>
            </div>

            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              disabled={loading}
              className="flex items-center gap-2 rounded-full bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-orange/90 disabled:opacity-70"
            >
              <IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-brand-orange/80">Ryver • real-time monitoring</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Live system health and forecast clarity.
            </h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
            Last update {live?.timestamp ? new Date(live.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-white/10 bg-brand-rose/10 px-4 py-3 text-sm text-brand-rose">
            <div className="flex items-start gap-3">
              <IconAlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Graceful preview mode is active</p>
                <p className="mt-1 text-xs text-zinc-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.95fr_0.95fr]">
          <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-400">PC health score</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">Performance posture</h3>
              </div>
              <div className="rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-zinc-300">Score</div>
            </div>

            <div className="mt-8 flex items-center justify-center">
              <div className="relative h-44 w-44">
                <svg className="absolute inset-0" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="transparent" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke={healthScore > 75 ? '#10b981' : healthScore > 40 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 42}
                    strokeDashoffset={2 * Math.PI * 42 * (1 - healthScore / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="relative flex h-full w-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-5xl font-semibold text-white">{healthScore}</p>
                    <p className="text-xs text-zinc-400 uppercase tracking-[0.25em] mt-1">/100</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-zinc-300">
              {healthScore > 75
                ? 'System optimal — expect stable performance for the next hour.'
                : healthScore > 40
                  ? 'Performance warning — review apps and memory usage soon.'
                  : 'System degraded — take action to avoid slowdowns or freezes.'}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCpu className="h-5 w-5 text-brand-orange" />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-400">CPU usage</p>
                  <p className="text-2xl font-semibold text-white">{live?.cpu || 0}%</p>
                </div>
              </div>
              <span className="rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-brand-orange">Live</span>
            </div>
            <div className="mt-6 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="cardCpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip contentStyle={{ background: '#0f1115', border: '1px solid rgba(255,255,255,0.08)' }} labelFormatter={(value) => formatTime(String(value))} />
                  <Area type="monotone" dataKey="cpu" stroke="#f97316" strokeWidth={2.5} fill="url(#cardCpuGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconDatabase className="h-5 w-5 text-brand-blue" />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-400">RAM usage</p>
                  <p className="text-2xl font-semibold text-white">{live?.memory || 0}%</p>
                </div>
              </div>
              <span className="rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-brand-blue">Live</span>
            </div>
            <div className="mt-6 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="cardMemGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip contentStyle={{ background: '#0f1115', border: '1px solid rgba(255,255,255,0.08)' }} labelFormatter={(value) => formatTime(String(value))} />
                  <Area type="monotone" dataKey="memory" stroke="#3b82f6" strokeWidth={2.5} fill="url(#cardMemGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-brand-orange/80">Actionable warnings</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Smart, prioritized next steps</h3>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
              Confidence {primaryRecommendation?.confidence ?? 0}% • Impact {primaryRecommendation?.timeToImpact ?? 'Now'}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`rounded-2xl border p-5 ${rec.type === 'critical' ? 'border-brand-rose/30 bg-brand-rose/10' : rec.type === 'warning' ? 'border-amber-500/30 bg-amber-500/10' : rec.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-brand-blue/30 bg-brand-blue/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {rec.type === 'critical' && <IconAlertCircle className="h-5 w-5 text-brand-rose" />}
                    {rec.type === 'warning' && <IconAlertCircle className="h-5 w-5 text-amber-500" />}
                    {rec.type === 'success' && <IconCheck className="h-5 w-5 text-brand-emerald" />}
                    {rec.type === 'info' && <IconActivity className="h-5 w-5 text-brand-blue" />}
                    <h4 className="text-sm font-semibold text-white">{rec.title}</h4>
                  </div>
                  {rec.actionable && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-orange">Action</span>}
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-300">{rec.message}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
                  <span>Confidence {rec.confidence}%</span>
                  <span>{rec.timeToImpact}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex border-b border-white/10 gap-4 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${activeTab === 'dashboard' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            <IconLayoutDashboard className="h-4 w-4" />
            Live dashboard
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${activeTab === 'forecast' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            <IconChartLine className="h-4 w-4" />
            AI forecasts
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${activeTab === 'history' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            <IconHistory className="h-4 w-4" />
            Historical logs
          </button>
        </div>

        {loading && !live ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-orange/30 border-t-brand-orange" />
            <p className="text-sm font-medium text-zinc-400">Connecting to your telemetry stream...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <IconCloud className="h-5 w-5 text-brand-orange" />
                    <span className="text-sm font-semibold text-white">Cloud status</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${live?.web_status === 200 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-brand-rose/10 text-brand-rose'}`}>
                    {live?.web_status === 200 ? 'Status 200 OK' : 'Offline or delayed'}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Latency</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{live?.response_time_ms || 0} ms</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">HTTP</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{live?.web_status || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <a href="https://real-time-system-monitor-with-ai.onrender.com" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-sm font-semibold text-brand-orange hover:underline">
                      Open app
                      <IconExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-brand-orange/20 bg-brand-orange/10 p-4 text-sm text-zinc-300">
                  <div className="flex items-center gap-2 text-white">
                    <IconTrendingUp className="h-4 w-4 text-brand-orange" />
                    Forecast posture
                  </div>
                  <p className="mt-2 text-sm leading-6">
                    {healthScore > 75
                      ? 'The system trend looks healthy, with enough headroom for steady work.'
                      : healthScore > 40
                        ? 'Watch the next stretch carefully, especially if more apps open.'
                        : 'The system is under pressure; a quick reset or lighter workload is recommended.'}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'forecast' && (
              <div className="grid gap-6">
                {forecast && forecast.cpu?.length ? (
                  <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                      <IconChartLine className="h-5 w-5 text-brand-orange" />
                      30-minute predictive outlook
                    </h3>
                    <div className="mt-4 h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={forecast.cpu.map((point, index) => ({
                          time: formatTime(point.ds),
                          'CPU Prediction': point.yhat,
                          'RAM Prediction': forecast.memory[index]?.yhat ?? 0,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                          <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} domain={[0, 100]} />
                          <Tooltip contentStyle={{ background: '#11131b', border: '1px solid rgba(255,255,255,0.08)' }} />
                          <Line type="monotone" dataKey="CPU Prediction" stroke="#f97316" strokeWidth={2.5} dot={false} />
                          <Line type="monotone" dataKey="RAM Prediction" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6 text-center text-sm text-zinc-400">
                    Forecast data is not available yet. Run the predictor locally to generate Prophet-based charts.
                  </div>
                )}

                <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-6">
                  <h3 className="text-sm font-semibold text-white">Prophet forecast image</h3>
                  <div className="mt-4 flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                    <img src={`${API_BASE}/api/forecast-image?salt=${imageSalt}`} alt="Prophet forecast graphics" className="max-h-[560px] w-full max-w-4xl rounded-xl object-contain" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 overflow-hidden">
                <div className="border-b border-white/10 p-6">
                  <h3 className="text-sm font-semibold text-white">InfluxDB history</h3>
                  <p className="mt-1 text-sm text-zinc-400">A recent view of aggregated telemetry captured from your local system and cloud endpoint.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-white/5 text-zinc-400">
                      <tr>
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">CPU</th>
                        <th className="p-4">Memory</th>
                        <th className="p-4">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {history.slice().reverse().map((item, idx) => (
                        <tr key={`${item.time}-${idx}`} className="hover:bg-white/5">
                          <td className="p-4 font-mono text-zinc-300">{new Date(item.time).toLocaleString()}</td>
                          <td className="p-4 text-zinc-300">{item.cpu !== undefined ? `${item.cpu}%` : 'N/A'}</td>
                          <td className="p-4 text-zinc-300">{item.memory !== undefined ? `${item.memory}%` : 'N/A'}</td>
                          <td className="p-4 text-zinc-300">{item.response_time_ms !== undefined ? `${item.response_time_ms} ms` : 'N/A'}</td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-zinc-500">No history yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-white/10 bg-[#07090c]/90 px-4 py-6 text-center">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <p className="text-xs font-medium tracking-[0.25em] text-zinc-500">Ryver — intelligent system monitoring and AI prediction</p>
          <p className="mt-3 text-xs leading-6 text-zinc-400">Ryver turns raw telemetry into clear alerts with confidence, impact timing, and practical next steps so you can act before problems arrive.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
