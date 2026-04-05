import time
import csv
import sys
import os
from datetime import datetime

# -----------------------------------------------------------------------------
# Safety Check: Handle missing dependencies
# -----------------------------------------------------------------------------
# We place the import of 'psutil' inside a try-except block.
# If the user hasn't installed the library, Python will throw an ImportError.
# We catch that error, print a helpful message, and exit gracefully instead of crashing.
try:
    import psutil
    from dotenv import load_dotenv
    import influxdb_client
    from influxdb_client.client.write_api import SYNCHRONOUS
except ImportError:
    print("Error: Required libraries are missing.")
    print("Please install them by running: pip install psutil influxdb-client python-dotenv")
    sys.exit(1)

# Load environment variables from .env file
load_dotenv()

# InfluxDB Configuration setup
INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN", "my-super-secret-auth-token")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "my-org")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "system_metrics")

# Define the file name where we will store the system logs
csv_filename = "system_logs.csv"

def setup_csv():
    """
    Initializes the CSV file with headers if it doesn't already exist.
    """
    # Open the file in 'a' (append) mode. 'newline=""' prevents blank lines between rows on Windows.
    file_exists = os.path.isfile(csv_filename)
    
    with open(csv_filename, mode='a', newline='') as file:
        writer = csv.writer(file)
        # If the file didn't exist before we opened it, write the column headers
        if not file_exists:
            writer.writerow([
                "Timestamp", 
                "CPU_Usage_%", 
                "Memory_Usage_%", 
                "Disk_Usage_%", 
                "Bytes_Sent", 
                "Bytes_Received"
            ])

def monitor_system():
    """
    Main loop to collect system metrics every 5 seconds and save them to a CSV.
    """
    # Set up the CSV headers
    setup_csv()
    
    # Initialize InfluxDB Client
    client = influxdb_client.InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    print(f"Starting predictive system monitoring...")
    print(f"Data will be saved to '{csv_filename}' and streamed to InfluxDB at {INFLUXDB_URL}.")
    print("Press Ctrl+C to stop the script gracefully.\n")
    
    try:
        # Run an infinite loop to continuously capture data
        while True:
            # 1. Capture current Timestamp
            # strftime formats the date and time in a readable string format
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # 2. Capture CPU Usage (%)
            # interval=1 tells psutil to measure CPU usage over 1 second to get an accurate reading
            cpu_usage = psutil.cpu_percent(interval=1)
            
            # 3. Capture Memory (RAM) Usage (%)
            # virtual_memory() returns a named tuple of memory usage statistics. We want the 'percent' field.
            memory = psutil.virtual_memory()
            memory_usage = memory.percent
            
            # 4. Capture Disk Usage (%)
            # We get the root drive of the current OS (e.g., 'C:\' on Windows or '/' on Linux)
            root_drive = os.path.abspath(os.sep)
            disk = psutil.disk_usage(root_drive)
            disk_usage = disk.percent
            
            # 5. Capture Network I/O (bytes sent/received)
            # net_io_counters() gives system-wide network statistics since boot
            network = psutil.net_io_counters()
            bytes_sent = network.bytes_sent
            bytes_recv = network.bytes_recv
            
            # 6. Storage: Save the "snapshot" into the CSV file
            with open(csv_filename, mode='a', newline='') as file:
                writer = csv.writer(file)
                writer.writerow([timestamp, cpu_usage, memory_usage, disk_usage, bytes_sent, bytes_recv])
            
            # 6.5 Storage: Write to InfluxDB
            # We create a new "Point" (equivalent to a row in a relational database but for time-series)
            point = (
                influxdb_client.Point("system_metrics")
                .tag("host", "local_machine")         # Tags are indexed, good for filtering (e.g., separating servers)
                .field("cpu_usage", cpu_usage)        # Fields contain the actual data values
                .field("memory_usage", memory_usage)
                .field("disk_usage", disk_usage)
                .field("bytes_sent", bytes_sent)
                .field("bytes_recv", bytes_recv)
            )
            # Write the point to InfluxDB
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
            
            # Print to console for immediate visual feedback (what we see on terminal)
            print(f"[{timestamp}] CPU: {cpu_usage}% | RAM: {memory_usage}% | Disk: {disk_usage}% "
                  f"| Net Sent: {bytes_sent}B | Net Recv: {bytes_recv}B")
            
            # 7. Structuring: Ensure the loop runs every 5 seconds.
            # Since psutil.cpu_percent(interval=1) paused the script for 1 second,
            # we only need to sleep for 4 more seconds to reach a 5-second interval.
            time.sleep(4)
            
    # Safety: Handle manual termination (Ctrl+C)
    except KeyboardInterrupt:
        # This block is triggered when the user presses Ctrl+C in the console
        print("\n\nMonitoring stopped by user (KeyboardInterrupt).")
        print("Exiting gracefully. All data has been saved to CSV and InfluxDB.")
        if 'client' in locals():
            client.close()
        sys.exit(0)
        
    except Exception as e:
        # Catch any other unexpected errors so the script doesn't crash without logging them
        print(f"\nAn unexpected error occurred: {e}")
        if 'client' in locals():
            client.close()
        sys.exit(1)

if __name__ == "__main__":
    monitor_system()
