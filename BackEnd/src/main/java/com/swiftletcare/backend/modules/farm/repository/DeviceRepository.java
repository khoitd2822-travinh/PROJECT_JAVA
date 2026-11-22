package com.swiftletcare.backend.modules.farm.repository;

import com.swiftletcare.backend.modules.farm.entity.Device;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DeviceRepository extends JpaRepository<Device, Long> {

    List<Device> findByFarmIdAndZoneId(Long farmId, Long zoneId);

    @Query("""
            select d.id from Device d
            where d.farmId = :farmId and d.zoneId = :zoneId
            order by d.id
            """)
    List<Long> findIdsByFarmIdAndZoneId(@Param("farmId") Long farmId, @Param("zoneId") Long zoneId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Device d where d.id = :id")
    Optional<Device> findForUpdate(@Param("id") Long id);
}