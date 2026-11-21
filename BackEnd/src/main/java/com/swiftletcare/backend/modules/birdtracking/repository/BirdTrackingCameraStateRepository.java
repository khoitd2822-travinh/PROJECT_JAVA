package com.swiftletcare.backend.modules.birdtracking.repository;

import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingCameraState;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BirdTrackingCameraStateRepository extends JpaRepository<BirdTrackingCameraState, Long> {
    Optional<BirdTrackingCameraState> findByCameraId(String cameraId);
    Optional<BirdTrackingCameraState> findTopByFarmIdAndZoneIdOrderByLastSeenDesc(Long farmId, Long zoneId);
}
