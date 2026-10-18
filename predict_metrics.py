import os
import sys
import pandas as pd
from datetime import datetime
from dateutil import tz

try:
    from dotenv import load_dotenv
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
    from prophet import Prophet
except ImportError:
    print("Error: Missing required predictor libraries.")
    sys.exit(1)

load_dotenv()
INFLUXDB_URL = os.getenv("INFLUXDB_URL")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET")

# Environment variable validation
if not INFLUXDB_URL:
    print("Error: INFLUXDB_URL environment variable is required.")
    sys.exit(1)
if not INFLUXDB_TOKEN:
    print("Error: INFLUXDB_TOKEN environment variable strictly required.")
    sys.exit(1)
if not INFLUXDB_ORG:
    print("Error: INFLUXDB_ORG environment variable is required.")
    sys.exit(1)
if not INFLUXDB_BUCKET:
    print("Error: INFLUXDB_BUCKET environment variable is required.")
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

def store_forecast_predictions(forecast_cpu, forecast_mem, forecast_web):
    """Store forecast predictions in InfluxDB for later accuracy comparison."""
    client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    prediction_time = datetime.now()
    
    # Store CPU predictions (future points only)
    if forecast_cpu is not None and not forecast_cpu.empty:
        # Get only future predictions (where ds > current time)
        current_time = prediction_time
        future_cpu = forecast_cpu[forecast_cpu['ds'] > current_time].head(60)  # Store next 60 points
        
        for _, row in future_cpu.iterrows():
            point = (
                Point("forecast_predictions")
                .tag("metric", "cpu_usage")
                .tag("prediction_time", prediction_time.strftime("%Y-%m-%dT%H:%M:%S"))
                .field("predicted_value", float(row['yhat']))
                .field("predicted_lower", float(row['yhat_lower']))
                .field("predicted_upper", float(row['yhat_upper']))
                .time(row['ds'])
            )
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
    
    # Store Memory predictions
    if forecast_mem is not None and not forecast_mem.empty:
        future_mem = forecast_mem[forecast_mem['ds'] > current_time].head(60)
        
        for _, row in future_mem.iterrows():
            point = (
                Point("forecast_predictions")
                .tag("metric", "memory_usage")
                .tag("prediction_time", prediction_time.strftime("%Y-%m-%dT%H:%M:%S"))
                .field("predicted_value", float(row['yhat']))
                .field("predicted_lower", float(row['yhat_lower']))
                .field("predicted_upper", float(row['yhat_upper']))
                .time(row['ds'])
            )
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
    
    # Store Web predictions if available
    if forecast_web is not None and not forecast_web.empty:
        future_web = forecast_web[forecast_web['ds'] > current_time].head(30)
        
        for _, row in future_web.iterrows():
            point = (
                Point("forecast_predictions")
                .tag("metric", "response_time_ms")
                .tag("prediction_time", prediction_time.strftime("%Y-%m-%dT%H:%M:%S"))
                .field("predicted_value", float(row['yhat']))
                .field("predicted_lower", float(row['yhat_lower']))
                .field("predicted_upper", float(row['yhat_upper']))
                .time(row['ds'])
            )
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
    
    write_api.close()
    client.close()
    print(f"Stored forecast predictions in InfluxDB for accuracy tracking")

def compare_predictions_with_actuals():
    """Compare past predictions with actual values and calculate accuracy metrics."""
    client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    query_api = client.query_api()
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    now = datetime.now()
    
    # Fetch predictions that are now in the past (predicted timestamp < now)
    # and haven't been compared yet (no comparison record exists)
    query_predictions = f"""
    from(bucket: "{INFLUXDB_BUCKET}")
      |> range(start: -2h)
      |> filter(fn: (r) => r._measurement == "forecast_predictions")
      |> filter(fn: (r) => r._time < now())
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
    """
    
    try:
        tables_pred = query_api.query(query_predictions, org=INFLUXDB_ORG)
        
        if not tables_pred:
            print("No past predictions found for comparison")
            client.close()
            return
        
        comparisons_made = 0
        
        for table in tables_pred:
            for record in table.records:
                pred_time = record.get_time()
                metric = record.values.get('metric')
                predicted_value = record.values.get('predicted_value')
                predicted_lower = record.values.get('predicted_lower')
                predicted_upper = record.values.get('predicted_upper')
                prediction_time_str = record.values.get('prediction_time')
                
                if not all([metric, predicted_value, pred_time]):
                    continue
                
                # Map metric to actual measurement
                if metric == 'cpu_usage':
                    actual_measurement = 'cpu_usage'
                    actual_measurement_type = 'system_metrics'
                elif metric == 'memory_usage':
                    actual_measurement = 'memory_usage'
                    actual_measurement_type = 'system_metrics'
                elif metric == 'response_time_ms':
                    actual_measurement = 'response_time_ms'
                    actual_measurement_type = 'web_monitor'
                else:
                    continue
                
                # Fetch actual value at the predicted timestamp
                query_actual = f"""
                from(bucket: "{INFLUXDB_BUCKET}")
                  |> range(start: {pred_time.replace(tzinfo=None).isoformat()}Z - 1m, stop: {pred_time.replace(tzinfo=None).isoformat()}Z + 1m)
                  |> filter(fn: (r) => r._measurement == "{actual_measurement_type}")
                  |> filter(fn: (r) => r._field == "{actual_measurement}")
                  |> mean()
                """
                
                tables_actual = query_api.query(query_actual, org=INFLUXDB_ORG)
                
                if tables_actual:
                    for actual_table in tables_actual:
                        for actual_record in actual_table.records:
                            actual_value = actual_record.get_value()
                            
                            if actual_value is None:
                                continue
                            
                            # Calculate error metrics
                            absolute_error = abs(predicted_value - actual_value)
                            percentage_error = (absolute_error / actual_value) * 100 if actual_value != 0 else 0
                            
                            # Check if actual value fell within confidence interval
                            within_ci = predicted_lower <= actual_value <= predicted_upper if predicted_lower and predicted_upper else None
                            
                            # Store the comparison result
                            comparison_point = (
                                Point("forecast_accuracy")
                                .tag("metric", metric)
                                .tag("prediction_time", prediction_time_str)
                                .field("predicted_value", float(predicted_value))
                                .field("actual_value", float(actual_value))
                                .field("absolute_error", float(absolute_error))
                                .field("percentage_error", float(percentage_error))
                                .field("within_confidence_interval", within_ci if within_ci is not None else False)
                                .time(pred_time)
                            )
                            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=comparison_point)
                            comparisons_made += 1
        
        write_api.close()
        client.close()
        print(f"Completed {comparisons_made} prediction comparisons")
        
    except Exception as e:
        print(f"Error during prediction comparison: {e}")
        write_api.close()
        client.close()


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
        
    store_forecast_predictions(forecast_cpu, forecast_mem, forecast_web)
    compare_predictions_with_actuals()
    export_forecast_json(forecast_cpu, forecast_mem, forecast_web)

