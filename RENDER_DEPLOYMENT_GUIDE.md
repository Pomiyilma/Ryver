# Ryver deployment guide

## Local development

1. Start InfluxDB:
   - `docker compose up -d`
   - Visit http://localhost:8086

2. Create the environment file:
   - Copy `.env.example` if present, or create `.env` with:
     - `INFLUXDB_URL=http://localhost:8086`
     - `INFLUXDB_TOKEN=...`
     - `INFLUXDB_ORG=my-org`
     - `INFLUXDB_BUCKET=system_metrics`
     - `RENDER_APP_URL=https://your-render-app.onrender.com`

3. Install Python dependencies:
   - `pip install -r requirements.txt` (if you add one) or install the needed packages manually.

4. Run the local services:
   - `python cloud_monitor.py`
   - `python predict_metrics.py`
   - `node server.js`
   - `cd frontend && npm install && npm start`

## Render deployment

1. Create a new Render Web Service for the repository.
2. Set the build command to:
   - `npm install && npm run build`
3. Set the start command to:
   - `node server.js`
4. Add environment variables:
   - `NODE_ENV=production`
   - `INFLUXDB_URL=...`
   - `INFLUXDB_TOKEN=...`
   - `INFLUXDB_ORG=...`
   - `INFLUXDB_BUCKET=...`
   - `RENDER_APP_URL=https://your-render-app.onrender.com`
5. Make sure the service has a public URL and can reach your InfluxDB instance.

## Notes

- The backend now serves a graceful fallback UI if telemetry is unavailable.
- Render should use the web service rather than static hosting so `/api/*` routes continue to function.
