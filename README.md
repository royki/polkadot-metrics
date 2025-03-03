# Polkadot Metrics Exporter

Metrics exporter for Polkadot blockchain nodes. The application fetches metrics from the Polkadot blockchain using the RPC endpoint and exports them in Prometheus format. The metrics can be scraped by Prometheus and visualized using Grafana.

       ┌─────────────┐         ┌─────────────┐
       │             │         │             │
       │  Polkadot   │<───────>│  Metrics    │
       │  Node       │         │  Exporter   │
       │             │         │             │
       └─────────────┘         └──────┬──────┘
                                      │
                                      │
                                      ▼
                               ┌─────────────┐
                               │             │
                               │ Prometheus  │
                               │             │
                               └──────┬──────┘
                                      │
                                      │
                                      ▼
                               ┌─────────────┐
                               │             │
                               │  Grafana    │
                               │             │
                               └─────────────┘

## API Endpoints

- `/metrics`: Returns metrics in Prometheus format
- `/status`: Returns detailed JSON with current blockchain metrics and status

## Setup Instructions

- Ubuntu 20.04 LTS or higher
- Node.js v18.x or higher
- Docker and Docker Compose (docker compose v2)

### Local Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/royki/polkadot-metrics.git
   cd polkadot-metrics
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure the application by editing config/config.yaml

4. Run the application:

   ```bash
   npm run dev -- config/config.yaml
   ```

### Docker Setup

Run the application with Prometheus and Grafana using Docker Compose:

1. Clone the repository:

   ```bash
   # Fenced code
   git clone https://github.com/royki/polkadot-metrics.git
   cd polkadot-metrics
   ```

2. Configure the application by editing config/config.yaml
3. Run the application:

   ```bash
   docker-compose up --build
   ```

### Access the services

- Status: <http://localhost:8080/status>
- Metrics Exporter: <http://localhost:8080/metrics>
- Prometheus: <http://localhost:9090>
- Grafana: <http://localhost:3000>

### App Configuration

- Configuration is handled via a YAML file (config.yaml)
- The configuration file contains the following fields:
  - `port`: Port to run the application
  - `rpc_url`: Polkadot RPC endpoint
  - `metrics_backend`: Metrics backend configuration (Prometheus, InfluxDB, or none)
    - InfluxDB is not tested. (Ignore this for now)
  - `metrics`: List of metrics to fetch using Pallets and Storage Items
  - `param_resolvers`: Parameter resolvers for storage items
  - `logging`: Logging configuration; log level and file paths

```yaml

server:
  port: 8080

blockchain:
  rpc_url: "wss://rpc.polkadot.io"  # Polkadot RPC endpoint

metrics_backend:
  type: "prometheus"  # Options: "prometheus", "influxdb", "none"
  influxdb:     # Only used if type is "influxdb"
    url: "http://localhost:8086"
    token: "your-influxdb-token"
    org: "your-org"
    bucket: "your-bucket"

metrics:
  - pallet: "session"
    storage_items:
      - name: "currentIndex"
    #   - name: "validators"
  - pallet: "system"
    storage_items:
      - name: "number"
  - pallet: "staking"
    storage_items:
      - name: "activeEra"
      - name: "erasRewardPoints"
        params: ["activeEra"]
  # Add more pallets and storage items here or in existing pallets

param_resolvers:
  staking:
    activeEra: "unwrapOrDefault().index.toNumber()"
    currentEra: "unwrapOrDefault().toNumber()"

logging:
  level: "info"  # Options: "debug", "info", "warn", "error"
  log_to_file: false
  log_file: "logs/app.log"
  error_log_file: "logs/error.log"
```

### Available Metrics

The application can export various metrics from the Polkadot blockchain:

- chain_info: Information about the chain (with name label)
- session_current_index: Current session index
- current_block_number: Current block number
- activeEra: Active era number
- currentEra: Current era number
- erasRewardPoints: Reward points for validators in the current/active era

### Prometheus Queries

- <http://localhost:9090/query>
- Example queries:
  - `chain_info`
  - `session_current_index`
  - `current_block_number`
  - `activeEra`
  - `currentEra`
  - `erasRewardPoints` (with `activeEra/cuurentEra` label)

#### To add new metrics

- Add them to the metrics section in config.yaml
- If necessary, add parameter resolvers in the param_resolvers section
