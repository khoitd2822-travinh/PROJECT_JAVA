package com.swiftletcare.backend.modules.actuation.service;

import com.swiftletcare.backend.modules.actuation.dto.CommandAck;
import com.swiftletcare.backend.modules.actuation.dto.CommandResponse;
import com.swiftletcare.backend.modules.actuation.dto.DeviceTarget;
import com.swiftletcare.backend.modules.actuation.entity.ActuationCommand;
import com.swiftletcare.backend.modules.actuation.entity.CommandStatus;
import com.swiftletcare.backend.modules.actuation.repository.ActuationCommandRepository;
import com.swiftletcare.backend.modules.farm.dto.DeviceControlRequest;
import com.swiftletcare.backend.modules.farm.entity.Device;
import com.swiftletcare.backend.modules.farm.repository.DeviceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Service
public class CommandService {
    private static final Logger log = LoggerFactory.getLogger(CommandService.class);
    private static final String BOARD_ID = "ESP32_ZONE_1";

    private final DeviceRepository devices;
    private final ActuationCommandRepository commands;
    private final ActuationService publisher;
    private final TransactionTemplate transaction;
    private final long timeoutSeconds;

    public CommandService(DeviceRepository devices, ActuationCommandRepository commands, ActuationService publisher, PlatformTransactionManager transactionManager, @Value("${actuation.ack-timeout-seconds:60}") long timeoutSeconds) {
        this.devices = devices;
        this.commands = commands;
        this.publisher = publisher;
        this.transaction = new TransactionTemplate(transactionManager);
        if (timeoutSeconds < 5 || timeoutSeconds > 300) {
            throw new IllegalArgumentException("ACK timeout phải từ 5 đến 300 giây");
        }
        this.timeoutSeconds = timeoutSeconds;
    }

    public CommandResponse submit(DeviceControlRequest request) {
        if (request == null || request.getDeviceId() == null || request.getDeviceId() <= 0) {
            throw error(HttpStatus.BAD_REQUEST, "deviceId không hợp lệ");
        }

        if (request.getCommand() == null) {
            throw error(HttpStatus.BAD_REQUEST, "Thiếu command");
        }

        String normalized = request.getCommand().toUpperCase(Locale.ROOT);

        if (!java.util.Set.of("ON", "OFF", "AUTO", "MANUAL")
                .contains(normalized)) {
            throw error(HttpStatus.BAD_REQUEST, "command chỉ được là ON, OFF, AUTO hoặc MANUAL");
        }

        boolean hasRequestedState = "ON".equals(normalized) || "OFF".equals(normalized);

        String requestedMode = hasRequestedState ? "MANUAL" : normalized;

        ActuationCommand command = transaction.execute(tx -> {
            Device device = devices.findForUpdate(request.getDeviceId())
                    .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Không tìm thấy thiết bị"));

            if (!Objects.equals(device.getFarmId(), 1L) || !Objects.equals(device.getZoneId(), 1L)) {
                throw error(HttpStatus.BAD_REQUEST, "Chỉ hỗ trợ farmId=1, zoneId=1");
            }
            DeviceTarget target;

            try {
                target = DeviceTarget.fromDeviceType(device.getDeviceType());
            } catch (IllegalArgumentException exception) {
                throw error(HttpStatus.UNPROCESSABLE_ENTITY, exception.getMessage());
            }
            if (commands.existsByDeviceIdAndStatus(
                    device.getId(), CommandStatus.PENDING)) {
                throw error(HttpStatus.CONFLICT, "Thiết bị đang có lệnh chờ ACK");
            }

            Instant now = Instant.now();

            ActuationCommand created = new ActuationCommand();
            created.setId(UUID.randomUUID());
            created.setDeviceId(device.getId());
            created.setBoardId(BOARD_ID);
            created.setTarget(target.getMqttTarget());

            created.setRequestedState(hasRequestedState ? ("ON".equals(normalized) ? 1 : 0) : null);

            created.setRequestedMode(requestedMode);
            created.setStatus(CommandStatus.PENDING);
            created.setCreatedAt(now);
            created.setExpiresAt(now.plus(Duration.ofSeconds(timeoutSeconds)));
            created.setMessage("Đang chờ ACK");
            return commands.saveAndFlush(created);
        });

        Objects.requireNonNull(command);

        if (!publisher.publishCommand(command)) {
            transaction.executeWithoutResult(tx -> {
                ActuationCommand stored = commands
                        .findForUpdate(command.getId())
                        .orElseThrow();

                if (stored.getStatus() == CommandStatus.PENDING) {
                    stored.setStatus(CommandStatus.PUBLISH_FAILED);
                    stored.setCompletedAt(Instant.now());
                    stored.setMessage("BE không xác nhận được publish thành công");
                }
            });
        }

        return get(command.getId());
    }

    public CommandResponse get(UUID commandId) {
        return transaction.execute(tx -> {
            ActuationCommand command = commands
                    .findForUpdate(commandId)
                    .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Không tìm thấy lệnh"));

            expireIfNeeded(command);
            return CommandResponse.from(command);
        });
    }

    public void handleAck(CommandAck ack) {
        if (ack == null || ack.commandId() == null || ack.success() == null) {
            log.warn("Bỏ qua ACK thiếu commandId/success");
            return;
        }

        transaction.executeWithoutResult(tx -> {
            ActuationCommand command = commands
                    .findForUpdate(ack.commandId())
                    .orElse(null);

            if (command == null) {
                log.warn("ACK không có lệnh: {}", ack.commandId());
                return;
            }

            expireIfNeeded(command);
            if (command.getStatus() != CommandStatus.PENDING) {
                log.info("Bỏ qua ACK commandId={}, status={}",
                        command.getId(),
                        command.getStatus());
                return;
            }

            if (!Objects.equals(command.getBoardId(), ack.boardId()) || !Objects.equals(command.getTarget(), ack.target())) {
                log.warn("ACK sai board/target: {}", command.getId());
                return;
            }

            if (!ack.success()) {
                command.setStatus(CommandStatus.REJECTED);
                command.setCompletedAt(Instant.now());
                command.setMessage(shortMessage(ack.message()));
                return;
            }

            if (ack.state() == null || (ack.state() != 0 && ack.state() != 1)) {
                log.warn("ACK có state không hợp lệ: {}", command.getId());
                return;
            }

            String expectedMode = command.getRequestedMode() == null ? "MANUAL" : command.getRequestedMode();
            if (!expectedMode.equals(ack.mode())) {
                log.warn("ACK sai mode: {}", command.getId());
                return;
            }

            if (command.getRequestedState() != null && !Objects.equals(command.getRequestedState(), ack.state())) {
                log.warn("ACK sai state: {}", command.getId());
                return;
            }

            Device device = devices.findForUpdate(command.getDeviceId())
                    .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Thiết bị không còn tồn tại"));

            device.setStatus(ack.state() == 1 ? "ON" : "OFF");
            device.setControlMode(ack.mode());
            device.setLastActive(LocalDateTime.now());

            command.setActualState(ack.state());
            command.setMode(ack.mode());
            command.setStatus(CommandStatus.CONFIRMED);
            command.setCompletedAt(Instant.now());
            command.setMessage(shortMessage(ack.message()));

            log.info("Confirmed commandId={}", command.getId());
        });
    }

    @Scheduled(fixedDelay = 1000)
    public void expirePendingCommands() {
        var expired = commands.findTop100ByStatusAndExpiresAtBeforeOrderByExpiresAtAsc(
                        CommandStatus.PENDING,
                        Instant.now());

        for (ActuationCommand candidate : expired) {
            transaction.executeWithoutResult(tx -> {
                commands.findForUpdate(candidate.getId())
                        .ifPresent(this::expireIfNeeded);
            });
        }
    }

    private void expireIfNeeded(ActuationCommand command) {
        if (command.getStatus() == CommandStatus.PENDING && !command.getExpiresAt().isAfter(Instant.now())) {
            command.setStatus(CommandStatus.TIMED_OUT);
            command.setCompletedAt(Instant.now());
            command.setMessage("Hết thời gian chờ, chưa xác nhận được kết quả");
        }
    }

    private String shortMessage(String message) {
        if (message == null || message.isBlank()) {
            return "Board đã phản hồi";
        }
        return message.substring(0, Math.min(message.length(), 250));
    }

    private ResponseStatusException error(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
}