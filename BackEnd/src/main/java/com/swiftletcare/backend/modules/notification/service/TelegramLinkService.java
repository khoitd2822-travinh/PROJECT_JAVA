package com.swiftletcare.backend.modules.notification.service;

import com.swiftletcare.backend.modules.auth.entity.User;
import com.swiftletcare.backend.modules.auth.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

@Service
public class TelegramLinkService {
    public static final long LINK_CODE_TTL_SECONDS = Duration.ofMinutes(10).toSeconds();

    private final UserRepository userRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public TelegramLinkService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public String createLinkCode(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Account not found"));
        byte[] codeBytes = new byte[8];
        secureRandom.nextBytes(codeBytes);
        String code = HexFormat.of().formatHex(codeBytes);
        user.setTelegramLinkCodeHash(hash(code));
        user.setTelegramLinkCodeExpiresAt(Instant.now().plusSeconds(LINK_CODE_TTL_SECONDS));
        userRepository.save(user);
        return code;
    }

    @Transactional(readOnly = true)
    public boolean isLinked(Long userId) {
        return userRepository.findById(userId)
                .map(user -> user.getTelegramChatId() != null)
                .orElse(false);
    }

    @Transactional
    public boolean linkChat(String code, String chatId) {
        if (code == null || code.isBlank() || chatId == null || chatId.isBlank()) return false;

        User user = userRepository.findByTelegramLinkCodeHashAndTelegramLinkCodeExpiresAtAfter(
                        hash(code.trim().toLowerCase(java.util.Locale.ROOT)), Instant.now())
                .orElse(null);
        if (user == null) return false;

        User existing = userRepository.findByTelegramChatId(chatId).orElse(null);
        if (existing != null && !Objects.equals(existing.getId(), user.getId())) {
            throw new TelegramChatAlreadyLinkedException();
        }

        user.setTelegramChatId(chatId);
        user.setTelegramLinkCodeHash(null);
        user.setTelegramLinkCodeExpiresAt(null);
        userRepository.save(user);
        return true;
    }

    @Transactional
    public boolean unlinkChat(String chatId) {
        User user = userRepository.findByTelegramChatId(chatId).orElse(null);
        if (user == null) return false;
        clearTelegramLink(user);
        userRepository.save(user);
        return true;
    }

    @Transactional
    public void unlinkUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Account not found"));
        clearTelegramLink(user);
        userRepository.save(user);
    }

    private void clearTelegramLink(User user) {
        user.setTelegramChatId(null);
        user.setTelegramLinkCodeHash(null);
        user.setTelegramLinkCodeExpiresAt(null);
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
