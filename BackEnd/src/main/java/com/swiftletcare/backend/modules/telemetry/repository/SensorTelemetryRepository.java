package com.swiftletcare.backend.modules.telemetry.repository;

import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SensorTelemetryRepository extends JpaRepository<SensorTelemetry, SensorTelemetryId> {

}
