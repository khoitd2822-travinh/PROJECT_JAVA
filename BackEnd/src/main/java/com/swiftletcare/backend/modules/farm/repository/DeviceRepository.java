package com.swiftletcare.backend.modules.farm.repository;

import com.swiftletcare.backend.modules.farm.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DeviceRepository extends JpaRepository<Device, Long> {
    List<Device> findByFarmIdAndZoneId(Long farmId, Long zoneId);
}