import React, { useState, useEffect, useCallback } from 'react';
import {
  IconCpu,
  IconDatabase,
  IconActivity,
  IconAlertCircle,
  IconCheck,
  IconRefresh,
  IconChartLine,
  IconClock,
  IconHistory,
  IconLayoutDashboard,
  IconCloud,
  IconExternalLink
} from '@tabler/icons-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import confetti from 'canvas-confetti';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';

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

function App() {
  const [live, setLive] = useState<LiveData | null>(null);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [activeTab, setActiveTab] = useState<'dashboard' | 'forecast' | 'history'>('dashboard');
  const [imageSalt, setImageSalt] = useState(0); // For forcing forecast image reload

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [liveRes, histRes, foreRes] = await Promise.all([
        fetch(`${API_BASE}/api/metrics/live`),
        fetch(`${API_BASE}/api/metrics/history`),
        fetch(`${API_BASE}/api/metrics/forecast`)
      ]);

      if (!liveRes.ok || !histRes.ok || !foreRes.ok) {
        throw new Error('Server returned an error status code');
      }

      const liveJson: LiveData = await liveRes.json();
      const histJson: HistoryData[] = await histRes.json();
      const foreJson: ForecastData = await foreRes.json();

      setLive(liveJson);
      setHistory(histJson);
      setForecast(foreJson);
      setImageSalt(prev => prev + 1);
    } catch (err: any) {
      console.error('Fetch Error:', err);
      setError('Could not connect to the backend server. Verify the server is running on port 3001.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchData();
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, fetchData]);

  // Calculate Health Score
  const calculateHealthScore = useCallback(() => {
    if (!live) return 100;
    let score = 100;

    // Deduct for CPU
    if (live.cpu > 80) score -= 25;
    else if (live.cpu > 50) score -= 10;

    // Deduct for Memory
    if (live.memory > 85) score -= 30;
    else if (live.memory > 70) score -= 15;

    // Deduct for Web Monitor
    if (live.web_status !== 200) score -= 20;
    if (live.response_time_ms > 1000) score -= 10;

    return Math.max(0, score);
  }, [live]);

  const healthScore = calculateHealthScore();

  // Trigger celebration on perfect health score load
  useEffect(() => {
    if (!loading && healthScore === 100) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.85 },
        colors: ['#f97316', '#10b981', '#3b82f6']
      });
    }
  }, [healthScore, loading]);

  // Generate Recommendations based on live and forecast data
  const getAIRecommendations = () => {
    const list = [];
    if (!live) return ['Analyzing system state...'];

    // CPU warnings
    if (live.cpu > 80) {
      list.push('Critical CPU usage detected. Close demanding tasks immediately.');
    } else if (live.cpu > 50) {
      list.push('Elevated CPU load. Your processor is actively handling tasks.');
    }

    // Memory warnings
    if (live.memory > 85) {
      list.push('RAM usage is near capacity. Close idle browser tabs or heavy apps.');
    } else if (live.memory > 70) {
      list.push('Warning: RAM usage is trending up - expect high memory pressure soon.');
    }

    // Web speed warnings
    if (live.web_status !== 200) {
      list.push('Alert: The monitored cloud app is unreachable (Status ' + live.web_status + ').');
    } else if (live.response_time_ms > 1500) {
      list.push('Response latency is high. Cloud app may be experiencing delays.');
    }

    // Forecast trends
    if (forecast && forecast.cpu && forecast.cpu.length > 0) {
      const futureCpu = forecast.cpu[forecast.cpu.length - 1].yhat;
      if (futureCpu > 75) {
        list.push('Prophet predicts high processor load within the next 30 minutes.');
      }
    }

    if (list.length === 0) {
      list.push('Your PC is healthy right now. Keep up the good work!');
    }

    return list;
  };

  const recommendations = getAIRecommendations();

  // Helper formatting dates
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-[100dvh] bg-espresso-darkest text-zinc-100 flex flex-col">
      {/* Navigation Header */}
      <header className="border-b border-white/5 bg-espresso-deep/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-orange/10 p-2 rounded-lg border border-brand-orange/20">
              <IconActivity className="h-6 width-6 text-brand-orange" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Sentinel AI</h1>
              <p className="text-xs text-zinc-400">Real-Time System Monitor & Predictor</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {live?.isSimulated && (
              <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                <IconAlertCircle className="h-3.5 w-3.5" />
                Simulated Mode
              </span>
            )}

            {!live?.isSimulated && live && (
              <span className="bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5" />
                InfluxDB Connected
              </span>
            )}

            <div className="flex items-center gap-2 bg-espresso-light/40 border border-white/5 rounded-lg px-2.5 py-1 text-xs">
              <IconClock className="h-3.5 w-3.5 text-zinc-400" />
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-zinc-200 outline-none cursor-pointer pr-1"
              >
                <option value={5} className="bg-espresso-deep">5s</option>
                <option value={15} className="bg-espresso-deep">15s</option>
                <option value={30} className="bg-espresso-deep">30s</option>
                <option value={60} className="bg-espresso-deep">60s</option>
                <option value={0} className="bg-espresso-deep">Paused</option>
              </select>
            </div>

            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              disabled={loading}
              className="bg-brand-orange hover:bg-brand-orange/90 text-white rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">

        {/* Error Notification Banner */}
        {error && (
          <div className="bg-brand-rose/10 border border-brand-rose/20 text-brand-rose rounded-xl p-4 text-sm flex items-start gap-3">
            <IconAlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Backend Unreachable</p>
              <p className="text-xs text-zinc-300 mt-1">{error}</p>
              <p className="text-xs text-zinc-400 mt-2 font-medium">Dashboard is running in Simulated Mode automatically so you can preview the UI features.</p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 gap-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'dashboard' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
          >
            <IconLayoutDashboard className="h-4 w-4" />
            Live Dashboard
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'forecast' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
          >
            <IconChartLine className="h-4 w-4" />
            AI Forecasts
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'history' ? 'border-brand-orange text-brand-orange' : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
          >
            <IconHistory className="h-4 w-4" />
            Historical Logs
          </button>
        </div>

        {/* Tab Contents */}
        {loading && !live ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-10 w-10 border-4 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin"></div>
            <p className="text-sm text-zinc-400 font-medium">Connecting to metrics database...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 1. Health Score Column */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                  <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                    <div className="absolute top-4 left-4 bg-white/5 border border-white/5 rounded-lg px-2.5 py-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                      Overview
                    </div>

                    <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-6 mt-4">PC Health Score</h3>

                    {/* Circular Score Indicator */}
                    <div className="relative h-44 w-44 flex items-center justify-center">
                      <svg className="absolute inset-0 transform -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          stroke="rgba(255,255,255,0.03)"
                          strokeWidth="8"
                          fill="transparent"
                        />
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
                      <div className="text-center">
                        <span className="text-5xl font-black tracking-tight">{healthScore}</span>
                        <span className="text-zinc-500 text-xs block font-bold mt-1">/ 100</span>
                      </div>
                    </div>

                    <div className="mt-6">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${healthScore > 75 ? 'bg-brand-emerald/10 text-brand-emerald' : healthScore > 40 ? 'bg-amber-500/10 text-amber-500' : 'bg-brand-rose/10 text-brand-rose'
                        }`}>
                        {healthScore > 75 ? 'System Optimal' : healthScore > 40 ? 'Performance Warning' : 'System Degraded'}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation Box */}
                  <div className="glass-panel rounded-2xl p-6 flex-1">
                    <h3 className="text-sm font-bold tracking-tight mb-4 flex items-center gap-2">
                      <IconActivity className="h-4 w-4 text-brand-orange" />
                      Actionable Warnings
                    </h3>
                    <ul className="flex flex-col gap-3">
                      {recommendations.map((rec, idx) => (
                        <li key={idx} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed bg-white/5 border border-white/5 rounded-xl p-3">
                          <IconAlertCircle className="h-4 w-4 shrink-0 text-brand-orange mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 2. Gauges & Real-time Sparklines Column */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* CPU Card */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <IconCpu className="h-4 w-4 text-brand-orange" />
                          <span className="text-sm font-bold">CPU Usage</span>
                        </div>
                        <span className="text-2xl font-black tracking-tight">{live?.cpu || 0}%</span>
                      </div>

                      {/* CPU Sparkline */}
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={history}>
                            <defs>
                              <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Tooltip
                              contentStyle={{ background: '#1a1714', border: '1px solid rgba(255,255,255,0.08)' }}
                              labelFormatter={(t) => formatTime(t)}
                            />
                            <Area type="monotone" dataKey="cpu" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Memory Card */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <IconDatabase className="h-4 w-4 text-brand-blue" />
                          <span className="text-sm font-bold">RAM Usage</span>
                        </div>
                        <span className="text-2xl font-black tracking-tight">{live?.memory || 0}%</span>
                      </div>

                      {/* Memory Sparkline */}
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={history}>
                            <defs>
                              <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Tooltip
                              contentStyle={{ background: '#1a1714', border: '1px solid rgba(255,255,255,0.08)' }}
                              labelFormatter={(t) => formatTime(t)}
                            />
                            <Area type="monotone" dataKey="memory" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                  </div>

                  {/* Cloud Monitor Status Card */}
                  <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex items-center gap-2">
                        <IconCloud className="h-5 w-5 text-brand-orange" />
                        <span className="text-sm font-bold">Cloud Web Monitor (Render App)</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${live?.web_status === 200 ? 'bg-brand-emerald/10 text-brand-emerald' : 'bg-brand-rose/10 text-brand-rose'
                        }`}>
                        {live?.web_status === 200 ? 'Status 200 OK' : 'Offline / Interrupted'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <span className="text-zinc-400 text-[10px] uppercase font-bold tracking-wider block">Response latency</span>
                        <span className="text-2xl font-black block mt-1">{live?.response_time_ms || 0} ms</span>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <span className="text-zinc-400 text-[10px] uppercase font-bold tracking-wider block">Status Code</span>
                        <span className="text-2xl font-black block mt-1">{live?.web_status || 'N/A'}</span>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col justify-center items-center">
                        <a
                          href="https://real-time-system-monitor-with-ai.onrender.com"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-orange font-semibold hover:underline flex items-center gap-1.5"
                        >
                          Visit App
                          <IconExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* 3. AI Forecast Tab */}
            {activeTab === 'forecast' && (
              <div className="flex flex-col gap-6">

                {/* Numerical Interactive Prophet Forecast */}
                {forecast && forecast.cpu && forecast.cpu.length > 0 ? (
                  <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-sm font-bold tracking-tight mb-4 flex items-center gap-2">
                      <IconChartLine className="h-5 w-5 text-brand-orange" />
                      30-Minute AI Predictive Analytics (CPU & RAM)
                    </h3>

                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={forecast.cpu.map((cPoint, index) => ({
                          time: formatTime(cPoint.ds),
                          'CPU Prediction': cPoint.yhat,
                          'CPU Bound Upper': cPoint.yhat_upper,
                          'CPU Bound Lower': cPoint.yhat_lower,
                          'RAM Prediction': forecast.memory[index]?.yhat
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                          <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} domain={[0, 100]} />
                          <Tooltip contentStyle={{ background: '#1a1714', border: '1px solid rgba(255,255,255,0.08)' }} />
                          <Line type="monotone" dataKey="CPU Prediction" stroke="#f97316" strokeWidth={3} dot={false} />
                          <Line type="monotone" dataKey="RAM Prediction" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex justify-center gap-6 mt-4 text-xs font-semibold">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-brand-orange rounded-full"></span> Predicted CPU %</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-brand-blue rounded-full"></span> Predicted RAM %</span>
                    </div>
                  </div>
                ) : (
                  <div className="glass-panel rounded-2xl p-6 text-center py-12">
                    <IconAlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold">Predictive Datasets Unpopulated</p>
                    <p className="text-xs text-zinc-400 mt-1">Run `python predict_metrics.py` to trigger Prophet modeling forecasts.</p>
                  </div>
                )}

                {/* Prophet forecast.png visualization */}
                <div className="glass-panel rounded-2xl p-6">
                  <h3 className="text-sm font-bold tracking-tight mb-4">Prophet Forecast Matrix Blueprint</h3>
                  <div className="border border-white/5 rounded-xl overflow-hidden bg-espresso-darkest flex items-center justify-center p-4">
                    <img
                      src={`${API_BASE}/api/forecast-image?salt=${imageSalt}`}
                      alt="Prophet Forecast Graphs"
                      className="max-h-[600px] w-auto object-contain rounded-lg shadow-2xl"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. History Logs Tab */}
            {activeTab === 'history' && (
              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-sm font-bold tracking-tight">InfluxDB Historical Data Ledger</h3>
                  <p className="text-xs text-zinc-400 mt-1">Showing aggregation windows of system metrics collected over the past 1-2 hours.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-zinc-400 font-bold border-b border-white/5">
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">CPU Usage</th>
                        <th className="p-4">Memory/RAM Usage</th>
                        <th className="p-4">Web Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.slice().reverse().map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-mono">{new Date(item.time).toLocaleString()}</td>
                          <td className="p-4">{item.cpu !== undefined ? `${item.cpu}%` : 'N/A'}</td>
                          <td className="p-4">{item.memory !== undefined ? `${item.memory}%` : 'N/A'}</td>
                          <td className="p-4">{item.response_time_ms !== undefined ? `${item.response_time_ms} ms` : 'N/A'}</td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-zinc-500 font-semibold">No historical logs found.</td>
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

      {/* Page Footer */}
      <footer className="border-t border-white/5 bg-espresso-deep py-6 px-4 text-center mt-auto">
        <p className="text-xs text-zinc-500 font-medium">Sentinel AI - Distributed System Monitoring Suite</p>
      </footer>
    </div>
  );
}

export default App;
