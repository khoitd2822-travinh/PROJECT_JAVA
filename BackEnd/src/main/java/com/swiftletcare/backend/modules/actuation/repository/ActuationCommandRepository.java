package com.swiftletcare.backend.modules.actuation.repository;

import com.swiftletcare.backend.modules.actuation.entity.ActuationCommand;
import com.swiftletcare.backend.modules.actuation.entity.CommandStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ActuationCommandRepository extends JpaRepository<ActuationCommand, UUID> {
    boolean existsByDeviceIdAndStatus(Long deviceId, CommandStatus status);
//Khóa DB giúp ACK và tác vụ timeout không cùng cập nhật một lệnh theo hai kết quả khác nhau. Spring Data hỗ trợ khai báo khóa bằng @Lock
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from ActuationCommand c where c.id = :id")
    Optional<ActuationCommand> findForUpdate(@Param("id") UUID id);

    List<ActuationCommand> findTop100ByStatusAndExpiresAtBeforeOrderByExpiresAtAsc(CommandStatus status, Instant now);
}