package com.swiftletcare.backend.modules.notification.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.notification.service.TelegramBotUpdateService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class TelegramWebhookControllerTest {
    private final TelegramBotUpdateService updateService = mock(TelegramBotUpdateService.class);
    private final TelegramWebhookController controller =
            new TelegramWebhookController(updateService, "webhook-secret");

    @Test
    void rejectsRequestsWithoutConfiguredWebhookSecret() throws Exception {
        var update = new ObjectMapper().readTree("{}");

        assertEquals(HttpStatus.UNAUTHORIZED,
                controller.receiveUpdate("incorrect-secret", update).getStatusCode());
        verifyNoInteractions(updateService);

        assertEquals(HttpStatus.OK,
                controller.receiveUpdate("webhook-secret", update).getStatusCode());
        verify(updateService).process(update);
    }
}
