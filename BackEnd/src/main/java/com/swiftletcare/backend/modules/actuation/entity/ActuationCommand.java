package com.swiftletcare.backend.modules.actuation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "actuation_commands", indexes = {@Index(name = "idx_command_device_status", columnList = "device_id,status"),
        @Index(name = "idx_command_status_expiry", columnList = "status,expires_at")})
@Getter
@Setter
@NoArgsConstructor
//Bảng này lưu lịch sử lệnh, tách khỏi bảng devices lưu trạng thái thiết bị.
public class ActuationCommand {
    @Id
    private UUID id;

    @Version
    private Long version;

    @Column(name = "device_id", nullable = false)
    private Long deviceId;

    @Column(name = "board_id", nullable = false, length = 64)
    private String boardId;

    @Column(nullable = false, length = 32)
    private String target;

    @Column(name = "requested_state")
    private Integer requestedState;

    @Column(name = "requested_mode", length = 16)
    private String requestedMode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private CommandStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "actual_state")
    private Integer actualState;

    @Column(length = 16)
    private String mode;

    @Column(length = 250)
    private String message;
}