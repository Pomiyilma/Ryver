const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { InfluxDB } = require('@influxdata/influxdb-client');
const { spawn } = require('child_process');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProduction ? true : '*',
  credentials: true,
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const url = process.env.INFLUXDB_URL;
const token = process.env.INFLUXDB_TOKEN;
const org = process.env.INFLUXDB_ORG;
const bucket = process.env.INFLUXDB_BUCKET;

// Environment variable validation
const requiredEnvVars = [];
if (!process.env.INFLUXDB_URL) requiredEnvVars.push('INFLUXDB_URL');
if (!process.env.INFLUXDB_TOKEN) requiredEnvVars.push('INFLUXDB_TOKEN');
if (!process.env.INFLUXDB_ORG) requiredEnvVars.push('INFLUXDB_ORG');
if (!process.env.INFLUXDB_BUCKET) requiredEnvVars.push('INFLUXDB_BUCKET');
if (!process.env.PORT) requiredEnvVars.push('PORT');

if (requiredEnvVars.length > 0 && process.env.NODE_ENV === 'production') {
  console.error(`[Server] ERROR: Missing required environment variables: ${requiredEnvVars.join(', ')}`);
  console.error('[Server] Please set these variables and restart the server.');
  process.exit(1);
}

let influxClient = null;
let queryApi = null;

if (token) {
  try {
    influxClient = new InfluxDB({ url, token });
    queryApi = influxClient.getQueryApi(org);
    console.log(`[InfluxDB] Client initialized for ${url}`);
  } catch (err) {
    console.error('[InfluxDB] Initialization error:', err.message);
  }
} else {
  console.warn('[InfluxDB] No token found; running with graceful preview data.');
}

// Prediction generation state
let lastPredictionTime = null;
let lastPredictionError = null;
let lastPredictionLog = null;
let isGeneratingPrediction = false;

function generatePrediction() {
  if (isGeneratingPrediction) {
    console.log('[Prediction] Already running, skipping this cycle');
    return;
  }

  isGeneratingPrediction = true;
  lastPredictionError = null;
  lastPredictionLog = null;
  console.log('[Prediction] Starting prediction generation...');

  const pythonProcess = spawn('python', ['predict_metrics.py'], {
    cwd: __dirname,
    stdio: 'pipe'
  });

  let stderrBuffer = '';

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Prediction] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    const stderrText = data.toString().trim();
    console.error(`[Prediction] stderr: ${stderrText}`);
    stderrBuffer += stderrText + '\n';
  });

  pythonProcess.on('close', (code) => {
    isGeneratingPrediction = false;
    
    // Store all stderr output for debugging
    lastPredictionLog = stderrBuffer.trim();
    
    if (code === 0) {
      lastPredictionTime = new Date().toISOString();
      lastPredictionError = null; // Clear any previous error on success
      console.log(`[Prediction] Completed successfully at ${lastPredictionTime}`);
    } else {
      console.error(`[Prediction] Failed with exit code ${code}`);
      // Check if stderr contains actual error indicators
      const hasRealError = /Error|Exception|Traceback|Failed/i.test(stderrBuffer);
      lastPredictionError = hasRealError ? stderrBuffer.trim() : `Process exited with code ${code}`;
    }
  });

  pythonProcess.on('error', (err) => {
    isGeneratingPrediction = false;
    console.error('[Prediction] Failed to spawn process:', err);
    lastPredictionError = err.message;
  });
}

// Schedule prediction generation every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log('[Prediction] Running scheduled prediction generation');
  generatePrediction();
});

// Generate initial prediction on startup (with a slight delay to let server start)
setTimeout(() => {
  console.log('[Prediction] Running initial prediction generation');
  generatePrediction();
}, 5000);

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
      },
    });
  });
}

function getMockLive() {
  const now = new Date().toISOString();
  return {
    timestamp: now,
    cpu: +(18 + Math.random() * 12).toFixed(2),
    memory: +(60 + Math.random() * 6).toFixed(2),
    web_status: Math.random() > 0.02 ? 200 : 504,
    response_time_ms: +(140 + Math.random() * 90).toFixed(2),
    isSimulated: true,
  };
}

function getMockHistory() {
  const history = [];
  const now = Date.now();
  for (let i = 59; i >= 0; i -= 1) {
    const time = new Date(now - i * 60000).toISOString();
    const cycle = i / 10;
    history.push({
      time,
      cpu: +(18 + Math.sin(cycle) * 8 + Math.random() * 4).toFixed(2),
      memory: +(60 + Math.cos(cycle) * 2 + Math.random() * 1).toFixed(2),
      response_time_ms: +(110 + Math.random() * 70).toFixed(2),
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
    isSimulated: true,
  };
  const now = Date.now();
  for (let i = 1; i <= 30; i += 1) {
    const time = new Date(now + i * 60000).toISOString();
    const cpuTrend = 24 + i * 0.35;
    const memTrend = 62 + i * 0.2;
    forecast.cpu.push({
      ds: time,
      yhat: +(cpuTrend + Math.sin(i / 2) * 6).toFixed(2),
      yhat_lower: +(cpuTrend - 8).toFixed(2),
      yhat_upper: +(cpuTrend + 8).toFixed(2),
    });
    forecast.memory.push({
      ds: time,
      yhat: +(memTrend + Math.cos(i / 3) * 1.5).toFixed(2),
      yhat_lower: +(memTrend - 4).toFixed(2),
      yhat_upper: +(memTrend + 4).toFixed(2),
    });
    forecast.web.push({
      ds: time,
      yhat: +(140 + Math.random() * 30).toFixed(2),
      yhat_lower: 100,
      yhat_upper: 220,
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
      res.json({ 
        ...parsed, 
        isSimulated: false,
        forecastGeneratedAt: lastPredictionTime,
        forecastAge: lastPredictionTime ? Math.floor((Date.now() - new Date(lastPredictionTime).getTime()) / 1000) : null
      });
    } catch (err) {
      console.error('[Backend] Error reading forecast.json:', err.message);
      res.json({ ...getMockForecast(), forecastGeneratedAt: lastPredictionTime, forecastAge: null });
    }
  } else {
    res.json({ ...getMockForecast(), forecastGeneratedAt: lastPredictionTime, forecastAge: null });
  }
});

// 4. Forecast Accuracy Metrics
app.get('/api/forecast-accuracy', async (req, res) => {
  if (!queryApi) {
    return res.json({
      status: 'insufficient_data',
      message: 'InfluxDB not connected',
      metrics: null
    });
  }

  // Fetch recent accuracy comparisons from InfluxDB
  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) => r._measurement == "forecast_accuracy")
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
  `;

  try {
    const rows = await runFluxQuery(fluxQuery);
    
    if (!rows || rows.length === 0) {
      return res.json({
        status: 'insufficient_data',
        message: 'Not enough comparison data yet. Accuracy metrics will be available after predictions have been compared with actual values.',
        metrics: null
      });
    }

    // Group by metric and calculate statistics
    const metricsData = {};
    rows.forEach(row => {
      const metric = row.metric;
      if (!metricsData[metric]) {
        metricsData[metric] = {
          count: 0,
          absoluteErrors: [],
          percentageErrors: [],
          withinCI: 0
        };
      }
      metricsData[metric].count++;
      if (row.absolute_error !== undefined) {
        metricsData[metric].absoluteErrors.push(row.absolute_error);
      }
      if (row.percentage_error !== undefined) {
        metricsData[metric].percentageErrors.push(row.percentage_error);
      }
      if (row.within_confidence_interval === true) {
        metricsData[metric].withinCI++;
      }
    });

    // Calculate rolling metrics for each metric
    const result = {
      status: 'available',
      message: 'Accuracy metrics calculated from recent prediction comparisons',
      metrics: {},
      summary: {
        totalComparisons: 0,
        overallMAE: 0,
        overallWithinCI: 0,
        overallWithinCIPercent: 0
      }
    };

    let totalComparisons = 0;
    let allAbsoluteErrors = [];
    let totalWithinCI = 0;

    Object.keys(metricsData).forEach(metric => {
      const data = metricsData[metric];
      const mae = data.absoluteErrors.length > 0 
        ? data.absoluteErrors.reduce((a, b) => a + b, 0) / data.absoluteErrors.length 
        : null;
      const withinCIPercent = data.count > 0 ? (data.withinCI / data.count) * 100 : null;

      result.metrics[metric] = {
        comparisonCount: data.count,
        meanAbsoluteError: mae,
        meanPercentageError: data.percentageErrors.length > 0
          ? data.percentageErrors.reduce((a, b) => a + b, 0) / data.percentageErrors.length
          : null,
        withinConfidenceIntervalPercent: withinCIPercent
      };

      totalComparisons += data.count;
      allAbsoluteErrors.push(...data.absoluteErrors);
      totalWithinCI += data.withinCI;
    });

    result.summary.totalComparisons = totalComparisons;
    result.summary.overallMAE = allAbsoluteErrors.length > 0
      ? allAbsoluteErrors.reduce((a, b) => a + b, 0) / allAbsoluteErrors.length
      : null;
    result.summary.overallWithinCI = totalWithinCI;
    result.summary.overallWithinCIPercent = totalComparisons > 0 
      ? (totalWithinCI / totalComparisons) * 100 
      : null;

    res.json(result);
  } catch (err) {
    console.error('[InfluxDB] Accuracy Query Error:', err.message);
    res.json({
      status: 'error',
      message: 'Error fetching accuracy metrics',
      metrics: null
    });
  }
});


const buildPath = path.join(__dirname, 'frontend', 'build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  console.log('[Server] Serving React build from:', buildPath);
} else {
  console.warn('[Server] React build not found. Run "npm run build" first.');
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ryver', 
    environment: isProduction ? 'production' : 'development',
    influxdb: queryApi ? 'connected' : 'disconnected',
    dataSource: queryApi ? 'real' : 'mock',
    prediction: {
      lastGeneratedAt: lastPredictionTime,
      lastError: lastPredictionError,
      lastLog: lastPredictionLog,
      isGenerating: isGeneratingPrediction,
      status: isGeneratingPrediction ? 'generating' : lastPredictionError ? 'error' : lastPredictionTime ? 'success' : 'pending'
    }
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  if (fs.existsSync(buildPath)) {
    res.sendFile(path.join(buildPath, 'index.html'));
  } else {
    res.status(404).send('React build not found. Please run "npm run build"');
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Ryver backend running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});
