import time
import csv
import sys
import os
import requests
from datetime import datetime

try:
    import psutil
    from dotenv import load_dotenv
    import influxdb_client
    from influxdb_client.client.write_api import SYNCHRONOUS
except ImportError:
    print("Error: Missing required libraries.")
    print("Run: pip install psutil influxdb-client python-dotenv requests")
    sys.exit(1)

load_dotenv()

INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
if not INFLUXDB_TOKEN:
    print("Security Alert: INFLUXDB_TOKEN is strictly required. Check your .env file.")
    sys.exit(1)

INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "my-org")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "system_metrics")
RENDER_APP_URL = os.getenv("RENDER_APP_URL")

csv_filename = "cloud_system_logs.csv"

def setup_csv():
    file_exists = os.path.isfile(csv_filename)
    with open(csv_filename, mode='a', newline='') as file:
        writer = csv.writer(file)
        if not file_exists:
            writer.writerow([
                "Timestamp", "CPU_Usage_%", "Memory_Usage_%", "Disk_Usage_%",
                "Bytes_Sent", "Bytes_Received", "Web_Status_Code", "Web_Response_Time_ms"
            ])

def monitor_distributed():
    setup_csv()
    client = influxdb_client.InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    print(f"Starting Distributed Sentinel (Cloud & Local) every 60s...")
    print(f"Pinging Web URL: {RENDER_APP_URL if RENDER_APP_URL else 'NOT CONFIGURED'}")
    print("Press Ctrl+C to stop.\n")
    
    try:
        while True:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # --- 1. LOCAL METRICS ---
            cpu_usage = psutil.cpu_percent(interval=1)
            memory_usage = psutil.virtual_memory().percent
            
            # Disk Usage (root drive)
            root_drive = os.path.abspath(os.sep)
            disk = psutil.disk_usage(root_drive)
            disk_usage = disk.percent
            
            # Network I/O
            network = psutil.net_io_counters()
            bytes_sent = network.bytes_sent
            bytes_recv = network.bytes_recv
            
            point_sys = (
                influxdb_client.Point("system_metrics")
                .tag("host", "local_machine")
                .field("cpu_usage", cpu_usage)
                .field("memory_usage", memory_usage)
                .field("disk_usage", disk_usage)
                .field("bytes_sent", bytes_sent)
                .field("bytes_recv", bytes_recv)
            )
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point_sys)
            
            # --- 2. CLOUD METRICS ---
            status_code = 0
            response_time_ms = 0.0
            
            if RENDER_APP_URL:
                try:
                    # Render free tier sleeps. Timeout is aggressive (65s) to capture wake-ups
                    response = requests.get(RENDER_APP_URL, timeout=65)
                    status_code = response.status_code
                    response_time_ms = response.elapsed.total_seconds() * 1000
                except requests.exceptions.Timeout:
                    print("[Cloud] Timeout! Free tier app is waking up...")
                    status_code = 504 
                except requests.exceptions.RequestException as e:
                    print(f"[Cloud] Connection Error: {e}")
                    status_code = 500
                
                point_web = (
                    influxdb_client.Point("web_monitor")
                    .tag("url", RENDER_APP_URL)
                    .field("web_status", status_code)
                    .field("response_time_ms", response_time_ms)
                )
                write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point_web)
            
            # --- 3. AUDIT LOGGING ---
            with open(csv_filename, mode='a', newline='') as file:
                writer = csv.writer(file)
                writer.writerow([timestamp, cpu_usage, memory_usage, disk_usage, 
                                bytes_sent, bytes_recv, status_code, round(response_time_ms, 2)])
                
            print(f"[{timestamp}] CPU: {cpu_usage}% | RAM: {memory_usage}% | Disk: {disk_usage}% | "
                  f"Net Sent: {bytes_sent}B | Net Recv: {bytes_recv}B | "
                  f"Web Status: {status_code} | Ping: {response_time_ms:.2f}ms")
            
            # Sleep 59 secs (since psutil.cpu_percent takes 1s)
            time.sleep(59)
            
    except KeyboardInterrupt:
        print("\nStopping Sentinel safely...")
        client.close()
        sys.exit(0)
    except Exception as e:
        print(f"\nCritical Exception: {e}")
        client.close()
        sys.exit(1)

if __name__ == "__main__":
    monitor_distributed()
