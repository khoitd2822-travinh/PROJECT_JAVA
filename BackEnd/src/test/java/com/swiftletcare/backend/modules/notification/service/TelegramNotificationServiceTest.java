package com.swiftletcare.backend.modules.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class TelegramNotificationServiceTest {
    private static final String ENDPOINT = "https://api.telegram.org/bottest-token/";
    private RestTemplate restTemplate;
    private MockRestServiceServer server;
    private TelegramNotificationService service;
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        restTemplate = new RestTemplate();
        server = MockRestServiceServer.bindTo(restTemplate).build();
        userRepository = mock(UserRepository.class);
        when(userRepository.findAllTelegramChatIds()).thenReturn(java.util.List.of("chat-123"));
        service = new TelegramNotificationService(restTemplate, new ObjectMapper(), "test-token", userRepository);
    }

    @Test
    void sendsTextAndImageToLinkedChatAndReportsApiAcceptance() {
        server.expect(requestTo(ENDPOINT + "sendMessage"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "chat_id": "chat-123",
                          "text": "Phat hien thu san"
                        }
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"result\":{\"message_id\":1}}",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(ENDPOINT + "sendPhoto"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "chat_id": "chat-123",
                          "photo": "https://images.example/alert.jpg"
                        }
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"result\":{\"message_id\":2}}",
                        MediaType.APPLICATION_JSON));

        assertTrue(service.sendAlertWithImage("Phat hien thu san", "https://images.example/alert.jpg"));
        server.verify();
    }

    @Test
    void sendsAlertsToEveryLinkedChat() {
        when(userRepository.findAllTelegramChatIds()).thenReturn(java.util.List.of("chat-123", "chat-456"));
        for (String chatId : java.util.List.of("chat-123", "chat-456")) {
            server.expect(requestTo(ENDPOINT + "sendMessage"))
                    .andExpect(content().json("""
                            {
                              "chat_id": "%s",
                              "text": "Threat detected"
                            }
                            """.formatted(chatId)))
                    .andRespond(withSuccess("{\"ok\":true,\"result\":{\"message_id\":1}}",
                            MediaType.APPLICATION_JSON));
        }

        assertTrue(service.sendText("Threat detected"));
        server.verify();
    }

    @Test
    void oneFailedChatDoesNotPreventDeliveryToOtherLinkedUsers() {
        when(userRepository.findAllTelegramChatIds()).thenReturn(java.util.List.of("chat-123", "chat-456"));
        server.expect(requestTo(ENDPOINT + "sendMessage"))
                .andExpect(content().json("""
                        {"chat_id":"chat-123","text":"Threat detected"}
                        """))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators
                        .withStatus(HttpStatus.BAD_REQUEST));
        server.expect(requestTo(ENDPOINT + "sendMessage"))
                .andExpect(content().json("""
                        {"chat_id":"chat-456","text":"Threat detected"}
                        """))
                .andRespond(withSuccess("{\"ok\":true,\"result\":{\"message_id\":1}}",
                        MediaType.APPLICATION_JSON));

        assertTrue(service.sendText("Threat detected"));
        server.verify();
    }

    @Test
    void apiBusinessErrorIsNotReportedAsSuccess() {
        server.expect(requestTo(ENDPOINT + "sendMessage"))
                .andRespond(withSuccess("{\"ok\":false,\"description\":\"chat not found\"}",
                        MediaType.APPLICATION_JSON));

        assertFalse(service.sendAlertWithImage("Alert", "https://images.example/alert.jpg"));
        server.verify();
    }

    @Test
    void httpFailureIsNotReportedAsSuccess() {
        server.expect(requestTo(ENDPOINT + "sendMessage"))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators
                        .withStatus(HttpStatus.UNAUTHORIZED));

        assertFalse(service.sendAlertWithImage("Alert", "https://images.example/alert.jpg"));
        server.verify();
    }

    @Test
    void missingCredentialsOrNonPublicUrlAreNotSent() {
        TelegramNotificationService unconfigured =
                new TelegramNotificationService(restTemplate, new ObjectMapper(), "", userRepository);

        assertFalse(unconfigured.sendAlertWithImage("Alert", "https://images.example/alert.jpg"));
        assertFalse(service.sendAlertWithImage("Alert", "https://localhost:9000/image.jpg"));
        assertFalse(service.sendAlertWithImage("Alert", "https://192.168.1.10/image.jpg"));
        server.verify();
    }

    @Test
    void doesNotSendAlertsWhenNoUsersHaveLinkedTelegram() {
        when(userRepository.findAllTelegramChatIds()).thenReturn(java.util.List.of());

        assertFalse(service.sendText("Alert"));
        server.verify();
    }
}
