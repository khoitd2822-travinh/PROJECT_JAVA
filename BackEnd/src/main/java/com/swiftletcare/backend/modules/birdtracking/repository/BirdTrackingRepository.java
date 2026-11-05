package com.swiftletcare.backend.modules.birdtracking.repository;

import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BirdTrackingRepository extends JpaRepository<BirdTrackingLog, Long> {
    List<BirdTrackingLog> findByFarmIdAndZoneIdOrderByTimestampDesc(Long farmId, Long zoneId);
}