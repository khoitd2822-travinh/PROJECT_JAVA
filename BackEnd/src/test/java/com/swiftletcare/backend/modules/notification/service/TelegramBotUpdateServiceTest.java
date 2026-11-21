package com.swiftletcare.backend.modules.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.*;

class TelegramBotUpdateServiceTest {
    private final TelegramLinkService linkService = mock(TelegramLinkService.class);
    private final TelegramNotificationService telegramService = mock(TelegramNotificationService.class);
    private final TelegramBotUpdateService service =
            new TelegramBotUpdateService(linkService, telegramService);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void startPromptsForCodeAndValidCodeLinksThePrivateChat() throws Exception {
        service.process(objectMapper.readTree("""
                {"message":{"chat":{"id":12345,"type":"private"},"text":"/start"}}
                """));
        verify(telegramService).sendTextToChat(eq("12345"), contains("mã liên kết"));

        when(linkService.linkChat("a1b2", "12345")).thenReturn(true);
        service.process(objectMapper.readTree("""
                {"message":{"chat":{"id":12345,"type":"private"},"text":"a1b2"}}
                """));
        verify(linkService).linkChat("a1b2", "12345");
        verify(telegramService).sendTextToChat(eq("12345"), contains("Liên kết thành công"));
    }

    @Test
    void ignoresGroupMessages() throws Exception {
        service.process(objectMapper.readTree("""
                {"message":{"chat":{"id":-12345,"type":"group"},"text":"/start"}}
                """));
        verifyNoInteractions(linkService, telegramService);
    }
}
