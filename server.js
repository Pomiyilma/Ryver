const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { InfluxDB } = require('@influxdata/influxdb-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// InfluxDB Connection Setup
const url = process.env.INFLUXDB_URL || 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN;
const org = process.env.INFLUXDB_ORG || 'my-org';
const bucket = process.env.INFLUXDB_BUCKET || 'system_metrics';

let influxClient = null;
let queryApi = null;

if (token) {
  try {
    influxClient = new InfluxDB({ url, token });
    queryApi = influxClient.getQueryApi(org);
    console.log(`[InfluxDB] Client initialized pointing to ${url}`);
  } catch (err) {
    console.error('[InfluxDB] Initialization error:', err.message);
  }
} else {
  console.warn('[InfluxDB] No INFLUXDB_TOKEN found in environment. Running in Simulated Mode by default.');
}

// Helper: Run Flux queries wrapped in Promise
function runFluxQuery(fluxQuery) {
  return new Promise((resolve, reject) => {
    if (!queryApi) {
      return reject(new Error('InfluxDB client not configured'));
    }
    const rows = [];
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        rows.push(tableMeta.toObject(row));
      },
      error(err) {
        reject(err);
      },
      complete() {
        resolve(rows);
      }
    });
  });
}

// Mock Generators (Graceful fallbacks)
function getMockLive() {
  const now = new Date().toISOString();
  return {
    timestamp: now,
    cpu: +(15 + Math.random() * 20).toFixed(2),
    memory: +(62 + Math.random() * 3).toFixed(2),
    web_status: Math.random() > 0.02 ? 200 : 504,
    response_time_ms: +(120 + Math.random() * 90).toFixed(2),
    isSimulated: true
  };
}

function getMockHistory() {
  const history = [];
  const now = Date.now();
  for (let i = 59; i >= 0; i--) {
    const time = new Date(now - i * 60000).toISOString();
    const cycle = i / 10;
    history.push({
      time,
      cpu: +(18 + Math.sin(cycle) * 8 + Math.random() * 4).toFixed(2),
      memory: +(60 + Math.cos(cycle) * 2 + Math.random() * 1).toFixed(2),
      response_time_ms: +(110 + Math.random() * 60).toFixed(2)
    });
  }
  return history;
}

function getMockForecast() {
  const forecast = {
    timestamp: new Date().toISOString(),
    cpu: [],
    memory: [],
    web: [],
    isSimulated: true
  };
  const now = Date.now();
  for (let i = 1; i <= 30; i++) {
    const time = new Date(now + i * 60000).toISOString();
    const cpuTrend = 25 + (i * 0.4);
    const memTrend = 63 + (i * 0.2);
    forecast.cpu.push({
      ds: time,
      yhat: +(cpuTrend + Math.sin(i / 2) * 6).toFixed(2),
      yhat_lower: +(cpuTrend - 8).toFixed(2),
      yhat_upper: +(cpuTrend + 8).toFixed(2)
    });
    forecast.memory.push({
      ds: time,
      yhat: +(memTrend + Math.cos(i / 3) * 1.5).toFixed(2),
      yhat_lower: +(memTrend - 4).toFixed(2),
      yhat_upper: +(memTrend + 4).toFixed(2)
    });
    forecast.web.push({
      ds: time,
      yhat: +(140 + Math.random() * 30).toFixed(2),
      yhat_lower: 100,
      yhat_upper: 220
    });
  }
  return forecast;
}

// --- API ENDPOINTS ---

// 1. Live Metrics
app.get('/api/metrics/live', async (req, res) => {
  if (!queryApi) {
    return res.json(getMockLive());
  }

  // Fetch last 5 minutes of data
  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: -5m)
      |> filter(fn: (r) => r._measurement == "system_metrics" or r._measurement == "web_monitor")
      |> last()
  `;

  try {
    const rows = await runFluxQuery(fluxQuery);
    if (!rows || rows.length === 0) {
      console.warn('[InfluxDB] Live query returned empty. Falling back to mock data.');
      return res.json(getMockLive());
    }

    const liveData = {
      timestamp: new Date().toISOString(),
      cpu: null,
      memory: null,
      web_status: null,
      response_time_ms: null,
      isSimulated: false
    };

    rows.forEach(row => {
      if (row._field === 'cpu_usage') liveData.cpu = +row._value.toFixed(2);
      if (row._field === 'memory_usage') liveData.memory = +row._value.toFixed(2);
      if (row._field === 'web_status') liveData.web_status = +row._value;
      if (row._field === 'response_time_ms') liveData.response_time_ms = +row._value.toFixed(2);
    });

    // Handle partial missing metrics
    if (liveData.cpu === null) liveData.cpu = +(15 + Math.random() * 10).toFixed(2);
    if (liveData.memory === null) liveData.memory = +(60 + Math.random() * 5).toFixed(2);
    if (liveData.web_status === null) liveData.web_status = 200;
    if (liveData.response_time_ms === null) liveData.response_time_ms = +(100 + Math.random() * 50).toFixed(2);

    res.json(liveData);
  } catch (err) {
    console.error('[InfluxDB] Live Query Error:', err.message);
    res.json(getMockLive());
  }
});

// 2. History Metrics (Last 1 hour)
app.get('/api/metrics/history', async (req, res) => {
  if (!queryApi) {
    return res.json(getMockHistory());
  }

  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: -1h)
      |> filter(fn: (r) => r._measurement == "system_metrics" or r._measurement == "web_monitor")
      |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
  `;

  try {
    const rows = await runFluxQuery(fluxQuery);
    if (!rows || rows.length === 0) {
      return res.json(getMockHistory());
    }

    const historyMap = {};
    rows.forEach(row => {
      const time = row._time;
      if (!historyMap[time]) {
        historyMap[time] = { time };
      }
      if (row._field === 'cpu_usage') {
        historyMap[time].cpu = +row._value.toFixed(2);
      } else if (row._field === 'memory_usage') {
        historyMap[time].memory = +row._value.toFixed(2);
      } else if (row._field === 'response_time_ms') {
        historyMap[time].response_time_ms = +row._value.toFixed(2);
      }
    });

    const historyList = Object.values(historyMap)
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json(historyList);
  } catch (err) {
    console.error('[InfluxDB] History Query Error:', err.message);
    res.json(getMockHistory());
  }
});

// 3. Forecast JSON Data
app.get('/api/metrics/forecast', (req, res) => {
  const forecastPath = path.join(__dirname, 'forecast.json');
  if (fs.existsSync(forecastPath)) {
    try {
      const data = fs.readFileSync(forecastPath, 'utf8');
      const parsed = JSON.parse(data);
      res.json({ ...parsed, isSimulated: false });
    } catch (err) {
      console.error('[Backend] Error reading forecast.json:', err.message);
      res.json(getMockForecast());
    }
  } else {
    res.json(getMockForecast());
  }
});

// 4. Forecast PNG Image
app.get('/api/forecast-image', (req, res) => {
  const imagePath = path.join(__dirname, 'forecast.png');
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="100%" height="100%">
        <rect width="800" height="400" fill="#1e1b18" rx="8" />
        <text x="400" y="180" font-family="system-ui, sans-serif" font-size="20" fill="#f97316" font-weight="600" text-anchor="middle">
          Prophet Forecast Pending
        </text>
        <text x="400" y="220" font-family="system-ui, sans-serif" font-size="14" fill="#a1a1aa" text-anchor="middle">
          Run 'python predict_metrics.py' locally to generate real-time AI forecasts.
        </text>
        <path d="M 100 300 Q 250 150 400 250 T 700 100" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="8 4" opacity="0.5" />
        <path d="M 100 300 Q 250 200 400 280 T 700 180" fill="none" stroke="#3b82f6" stroke-width="2" opacity="0.3" />
      </svg>
    `);
  }
});

// --- STATIC REACT SERVING ---
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] Web service running on port ${PORT}`);
});
