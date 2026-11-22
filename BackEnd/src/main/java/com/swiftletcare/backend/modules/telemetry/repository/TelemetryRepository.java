
package com.swiftletcare.backend.modules.telemetry.repository;

import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface TelemetryRepository extends JpaRepository<SensorTelemetry, SensorTelemetryId> {

    @Query(value = """
            SELECT *
            FROM (
                SELECT st.*,
                       ROW_NUMBER() OVER (
                           ORDER BY st.time ASC, st.device_id ASC
                       ) AS rn,
                       COUNT(*) OVER () AS total
                FROM sensor_telemetry st
                WHERE st.farm_id = :farmId
                  AND st.zone_id = :zoneId
                  AND st.time > :from
            ) sampled
            WHERE total <= 500
               OR MOD(rn - 1, GREATEST(1, CEIL(total / 500.0)::bigint)) = 0
            ORDER BY time ASC, device_id ASC
            """, nativeQuery = true)
    List<SensorTelemetry> findSampledHistory(
            @Param("farmId") Long farmId,
            @Param("zoneId") Long zoneId,
            @Param("from") Instant from);
}
