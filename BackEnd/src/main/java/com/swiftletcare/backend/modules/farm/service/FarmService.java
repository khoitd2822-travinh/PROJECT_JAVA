package com.swiftletcare.backend.modules.farm.service;

import com.swiftletcare.backend.modules.actuation.dto.CommandResponse;
import com.swiftletcare.backend.modules.actuation.service.CommandService;
import com.swiftletcare.backend.modules.farm.dto.DeviceControlRequest;
import com.swiftletcare.backend.modules.farm.dto.DeviceResponse;
import com.swiftletcare.backend.modules.farm.entity.Device;
import com.swiftletcare.backend.modules.farm.repository.DeviceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

@Service
public class FarmService {
    private final DeviceRepository deviceRepository;
    private final CommandService commandService;

    public FarmService(DeviceRepository deviceRepository, CommandService commandService) {
        this.deviceRepository = deviceRepository;
        this.commandService = commandService;
    }

    public List<DeviceResponse> getDevices(Long farmId, Long zoneId) {
        if (!Objects.equals(farmId, 1L) || !Objects.equals(zoneId, 1L)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ hỗ trợ farmId=1, zoneId=1");
        }

        return deviceRepository
                .findByFarmIdAndZoneId(farmId, zoneId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public CommandResponse sendCommand(DeviceControlRequest request) {
        return commandService.submit(request);
    }

    private DeviceResponse toResponse(Device device) {
        return DeviceResponse.builder()
                .id(device.getId())
                .name(device.getName())
                .deviceType(device.getDeviceType())
                .status(device.getStatus())
                .zoneId(device.getZoneId())
                .farmId(device.getFarmId())
                .lastActive(device.getLastActive())
                .controlMode(device.getControlMode())
                .build();
    }
}