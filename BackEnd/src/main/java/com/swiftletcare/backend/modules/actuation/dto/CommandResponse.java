package com.swiftletcare.backend.modules.actuation.dto;

import com.swiftletcare.backend.modules.actuation.entity.ActuationCommand;
import com.swiftletcare.backend.modules.actuation.entity.CommandStatus;

import java.time.Instant;
import java.util.UUID;

public record CommandResponse(
        UUID commandId,
        Long deviceId,
        String target,
        String requestedCommand,
        CommandStatus status,
        boolean confirmed,
        Integer actualState,
        String mode,
        Instant createdAt,
        Instant expiresAt,
        Instant completedAt,
        String message) {

    public static CommandResponse from(ActuationCommand command) {
        String requestedCommand;

        if (command.getRequestedState() != null) {
            requestedCommand = command.getRequestedState() == 1 ? "ON" : "OFF";
        } else {
            requestedCommand = command.getRequestedMode();
        }

        return new CommandResponse(
                command.getId(),
                command.getDeviceId(),
                command.getTarget(),
                requestedCommand,
                command.getStatus(),
                command.getStatus() == CommandStatus.CONFIRMED,
                command.getActualState(),
                command.getMode(),
                command.getCreatedAt(),
                command.getExpiresAt(),
                command.getCompletedAt(),
                command.getMessage());
    }
}