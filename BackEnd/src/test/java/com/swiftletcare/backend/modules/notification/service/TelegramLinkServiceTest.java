package com.swiftletcare.backend.modules.notification.service;

import com.swiftletcare.backend.modules.auth.entity.User;
import com.swiftletcare.backend.modules.auth.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class TelegramLinkServiceTest {
    private final UserRepository userRepository = mock(UserRepository.class);
    private final TelegramLinkService service = new TelegramLinkService(userRepository);

    @Test
    void createsHashedExpiringCodeAndConsumesItWhenLinkingChat() {
        User user = new User("Test User", "user@example.com", "password");
        user.setId(7L);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(userRepository.findByTelegramLinkCodeHashAndTelegramLinkCodeExpiresAtAfter(
                anyString(), any(Instant.class))).thenReturn(Optional.of(user));
        when(userRepository.findByTelegramChatId("12345")).thenReturn(Optional.empty());

        String code = service.createLinkCode(7L);

        assertNotEquals(code, user.getTelegramLinkCodeHash());
        assertTrue(service.linkChat(code, "12345"));
        org.junit.jupiter.api.Assertions.assertNull(user.getTelegramLinkCodeHash());
        org.junit.jupiter.api.Assertions.assertNull(user.getTelegramLinkCodeExpiresAt());
        verify(userRepository, times(2)).save(user);
    }

    @Test
    void rejectsExpiredCodesAndChatsLinkedToAnotherAccount() {
        when(userRepository.findByTelegramLinkCodeHashAndTelegramLinkCodeExpiresAtAfter(
                anyString(), any(Instant.class))).thenReturn(Optional.empty());
        assertFalse(service.linkChat("expired-code", "12345"));

        User account = new User("Account", "account@example.com", "password");
        account.setId(1L);
        User other = new User("Other", "other@example.com", "password");
        other.setId(2L);
        when(userRepository.findByTelegramLinkCodeHashAndTelegramLinkCodeExpiresAtAfter(
                anyString(), any(Instant.class))).thenReturn(Optional.of(account));
        when(userRepository.findByTelegramChatId("12345")).thenReturn(Optional.of(other));

        assertThrows(TelegramChatAlreadyLinkedException.class,
                () -> service.linkChat("valid-code", "12345"));
    }
}
