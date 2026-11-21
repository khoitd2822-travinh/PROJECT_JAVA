package com.swiftletcare.backend.modules.auth.repository;

import com.swiftletcare.backend.modules.auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Boolean existsByEmail(String email);
    Optional<User> findByTelegramChatId(String telegramChatId);
    Optional<User> findByTelegramLinkCodeHashAndTelegramLinkCodeExpiresAtAfter(
            String telegramLinkCodeHash, Instant now);

    @Query("select u.telegramChatId from User u where u.telegramChatId is not null")
    List<String> findAllTelegramChatIds();
}