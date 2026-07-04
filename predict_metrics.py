import os
import sys
import pandas as pd
from datetime import datetime
from dateutil import tz
import matplotlib.pyplot as plt

try:
    from dotenv import load_dotenv
    from influxdb_client import InfluxDBClient
    from prophet import Prophet
except ImportError:
    print("Error: Missing required predictor libraries.")
    sys.exit(1)

load_dotenv()
INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "my-org")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "system_metrics")

if not INFLUXDB_TOKEN:
    print("Error: INFLUXDB_TOKEN environment variable strictly required.")
    sys.exit(1)

def fetch_data():
    client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    query_api = client.query_api()

    # 1. Fetch Local CPU and RAM
    query_sys = f"""
    from(bucket: "{INFLUXDB_BUCKET}")
      |> range(start: -1h)
      |> filter(fn: (r) => r._measurement == "system_metrics")
      |> filter(fn: (r) => r._field == "cpu_usage" or r._field == "memory_usage")
    """
    
    # 2. Fetch Remote Web Speed 
    query_web = f"""
    from(bucket: "{INFLUXDB_BUCKET}")
      |> range(start: -1h)
      |> filter(fn: (r) => r._measurement == "web_monitor")
      |> filter(fn: (r) => r._field == "response_time_ms")
    """
    
    print("Fetching data streams from InfluxDB...")
    tables_sys = query_api.query(query_sys, org=INFLUXDB_ORG)
    tables_web = query_api.query(query_web, org=INFLUXDB_ORG)
    client.close()
    
    # Parse System System Metrics
    records_sys = []
    for table in tables_sys:
        for record in table.records:
            records_sys.append({"time": record.get_time(), "field": record.get_field(), "value": record.get_value()})
    
    df_sys = pd.DataFrame(records_sys)
    local_zone = tz.tzlocal()
    
    if not df_sys.empty:
        df_sys['time'] = df_sys['time'].dt.tz_convert(local_zone).dt.tz_localize(None)
        df_cpu = df_sys[df_sys['field'] == 'cpu_usage'][['time', 'value']].rename(columns={'time': 'ds', 'value': 'y'})
        df_mem = df_sys[df_sys['field'] == 'memory_usage'][['time', 'value']].rename(columns={'time': 'ds', 'value': 'y'})
    else:
        print("No System data found!")
        sys.exit(0)

    # Parse Web Metrics
    records_web = []
    for table in tables_web:
        for record in table.records:
            records_web.append({"time": record.get_time(), "field": record.get_field(), "value": record.get_value()})
            
    df_web = pd.DataFrame(records_web)
    if not df_web.empty:
        df_web['time'] = df_web['time'].dt.tz_convert(local_zone).dt.tz_localize(None)
        df_web = df_web[df_web['field'] == 'response_time_ms'][['time', 'value']].rename(columns={'time': 'ds', 'value': 'y'})
    
    return df_cpu, df_mem, df_web

def train_and_predict(df, name, freq='5s', periods=360):
    print(f"Training Prophet model for {name}...")
    model = Prophet(growth='flat', yearly_seasonality=False, weekly_seasonality=False, daily_seasonality=False)
    model.fit(df)
    
    future = model.make_future_dataframe(periods=periods, freq=freq)
    return model.predict(future)

def plot_forecasts(df_cpu, forecast_cpu, df_mem, forecast_mem, df_web, forecast_web):
    num_plots = 3 if not df_web.empty and forecast_web is not None else 2
    fig, axes = plt.subplots(num_plots, 1, figsize=(12, 5 * num_plots))
    if num_plots == 2:
        (ax1, ax2) = axes
    else:
        (ax1, ax2, ax3) = axes

    # Plot CPU
    ax1.plot(df_cpu['ds'], df_cpu['y'], label='Actual CPU Usage (%)', color='blue')
    ax1.plot(forecast_cpu['ds'], forecast_cpu['yhat'], label='Predicted', color='red', linestyle='dashed')
    ax1.fill_between(forecast_cpu['ds'], forecast_cpu['yhat_lower'], forecast_cpu['yhat_upper'], color='red', alpha=0.2)
    ax1.set_title("CPU Usage Forecast")
    ax1.grid(True)
    
    # Plot Memory
    ax2.plot(df_mem['ds'], df_mem['y'], label='Actual Memory Usage (%)', color='green')
    ax2.plot(forecast_mem['ds'], forecast_mem['yhat'], label='Predicted', color='orange', linestyle='dashed')
    ax2.fill_between(forecast_mem['ds'], forecast_mem['yhat_lower'], forecast_mem['yhat_upper'], color='orange', alpha=0.2)
    ax2.set_title("Memory Usage Forecast")
    ax2.grid(True)
    
    # Plot Web Speed Optional
    if num_plots == 3:
        ax3.plot(df_web['ds'], df_web['y'], label='Actual Response Time (ms)', color='purple')
        ax3.plot(forecast_web['ds'], forecast_web['yhat'], label='Predicted', color='magenta', linestyle='dashed')
        ax3.fill_between(forecast_web['ds'], forecast_web['yhat_lower'], forecast_web['yhat_upper'], color='magenta', alpha=0.2)
        ax3.set_title("Cloud Response Time Forecast")
        ax3.grid(True)
    
    plt.tight_layout()
    plt.savefig('forecast.png')
    print("Successfully generated blueprint graphs in 'forecast.png'")

def export_forecast_json(forecast_cpu, forecast_mem, forecast_web):
    import json
    
    def prepare_data(df):
        if df is None or df.empty:
            return []
        # Take the last 60 forecasted points (representing future trends)
        df_pred = df.tail(60).copy()
        data = []
        for _, row in df_pred.iterrows():
            data.append({
                "ds": row['ds'].strftime("%Y-%m-%dT%H:%M:%S"),
                "yhat": round(float(row['yhat']), 2),
                "yhat_lower": round(float(row['yhat_lower']), 2),
                "yhat_upper": round(float(row['yhat_upper']), 2)
            })
        return data

    output = {
        "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "cpu": prepare_data(forecast_cpu),
        "memory": prepare_data(forecast_mem),
        "web": prepare_data(forecast_web)
    }
    
    with open("forecast.json", "w") as f:
        json.dump(output, f, indent=2)
    print("Successfully exported numeric predictions to 'forecast.json'")

if __name__ == "__main__":
    df_cpu, df_mem, df_web = fetch_data()
    
    # Local runs every 5s -> forecast next 30 mins (360 * 5s)
    forecast_cpu = train_and_predict(df_cpu, "CPU Usage", freq='5s', periods=360)
    forecast_mem = train_and_predict(df_mem, "Memory Usage", freq='5s', periods=360)
    
    forecast_web = None
    if not df_web.empty:
        # Cloud runs every 60s -> forecast next 30 mins (30 * 60s)
        forecast_web = train_and_predict(df_web, "Web Response", freq='60s', periods=30)
        
    plot_forecasts(df_cpu, forecast_cpu, df_mem, forecast_mem, df_web, forecast_web)
    export_forecast_json(forecast_cpu, forecast_mem, forecast_web)

