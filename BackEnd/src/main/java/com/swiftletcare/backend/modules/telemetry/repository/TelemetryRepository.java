package com.swiftletcare.backend.modules.telemetry.repository;

import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface TelemetryRepository extends JpaRepository<SensorTelemetry, SensorTelemetryId> {

    List<SensorTelemetry> findByFarmIdAndZoneIdAndId_TimeAfterOrderById_TimeAsc(
            Long farmId, Long zoneId, Instant from);

}
