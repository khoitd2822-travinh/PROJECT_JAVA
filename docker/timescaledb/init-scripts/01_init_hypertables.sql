CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS sensor_telemetry (
    time TIMESTAMPTZ NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    farm_id BIGINT DEFAULT 1,
    zone_id BIGINT DEFAULT 1,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    co2_level INTEGER,
    light_level INTEGER,
    sound_db DOUBLE PRECISION,
    fan_state BOOLEAN,
    mist_state BOOLEAN,
    heater_state BOOLEAN,
    alarm_state BOOLEAN,
    PRIMARY KEY (time, device_id)
);

SELECT create_hypertable('sensor_telemetry', 'time', 
if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');

CREATE INDEX IF NOT EXISTS idx_telemetry_device_time 
ON sensor_telemetry (device_id, time DESC);