# 🖥️ Ryver Frontend: Mission-Control Telemetry Dashboard

The modern, real-time telemetry and predictive analytics dashboard for **Ryver**, engineered with **React 19**, **TypeScript**, **TailwindCSS**, and **Recharts**.

---

## 🌟 Highlights

- **Real-Time System Posture**: Continuous streaming telemetry updates with configurable polling intervals (5s, 10s, 15s, 30s, 60s, or paused).
- **Dynamic PC Health Scoring Engine**: Multi-metric weighted evaluator scoring system stability from 0 to 100.
- **Proactive Anomaly & Time-to-Impact Alerting**: Predictive threshold evaluations calculating projected impact windows (e.g. `~12 min to threshold`) with empirical confidence ratings.
- **Interactive Time-Series Visualizations**: Smooth area charts and multi-horizon trendlines featuring confidence intervals ($y_{hat}$, $y_{hat\_upper}$, $y_{hat\_lower}$) powered by Recharts.
- **Fail-Safe Preview Fallback**: Graceful visual indicators when operating under mock or live telemetry data sources.
- **Glassmorphic Bloomberg-Terminal Aesthetic**: Tuned dark theme with radial glow gradients, custom scrollbars, and micro-animations.

---

## 🧱 Component & State Architecture

- `src/App.tsx`: Central telemetry controller managing live feeds, historical logs, predictive forecast models, and dynamic recommendation generation.
- `src/ErrorBoundary.tsx`: Production-grade error boundary ensuring chart or parsing anomalies fail gracefully without crashing the UI.
- `src/index.css`: TailwindCSS directives and custom dark-mode styling variables.

---

## 🚀 Available Scripts

In this directory, you can run:

### `npm start`
Runs the dashboard in development mode at [http://localhost:3000](http://localhost:3000). The dev server proxies API calls to the Ryver gateway (default `http://localhost:3001`).

### `npm run build`
Compiles TypeScript, processes Tailwind directives, and bundles an optimized production build into the `build` directory.

### `npm test`
Launches the interactive test runner via React Testing Library.

---

## ⚙️ Environment Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `REACT_APP_API_URL` | `http://localhost:3001` (dev) / `""` (prod) | Base URL for the Ryver Node.js API Gateway |
