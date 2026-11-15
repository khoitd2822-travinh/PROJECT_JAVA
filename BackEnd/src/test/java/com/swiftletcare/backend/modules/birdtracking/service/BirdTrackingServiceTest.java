package com.swiftletcare.backend.modules.birdtracking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.birdtracking.entity.BirdTrackingLog;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingCameraStateRepository;
import com.swiftletcare.backend.modules.birdtracking.repository.BirdTrackingRepository;
import com.swiftletcare.backend.modules.notification.service.WebSocketBroadcaster;
import com.swiftletcare.backend.modules.notification.service.TelegramNotificationService;
import com.swiftletcare.backend.modules.storage.service.MinioStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class BirdTrackingServiceTest {
    private static final String EVENT_ID = UUID.randomUUID().toString();
    private BirdTrackingRepository repository;
    private TelegramNotificationService telegram;
    private MinioStorageService storage;
    private BirdTrackingService service;
    private BirdTrackingLog event;
    private final List<Runnable> queuedTasks = new ArrayList<>();

    @BeforeEach
    void setUp() {
        repository = mock(BirdTrackingRepository.class);
        var stateRepository = mock(BirdTrackingCameraStateRepository.class);
        var broadcaster = mock(WebSocketBroadcaster.class);
        telegram = mock(TelegramNotificationService.class);
        storage = mock(MinioStorageService.class);
        TaskExecutor executor = queuedTasks::add;
        service = new BirdTrackingService(repository, new ObjectMapper(), stateRepository,
                broadcaster, telegram, storage, executor);
        event = BirdTrackingLog.builder().eventId(EVENT_ID).cameraId("cam-01")
                .eventType("THREAT_ALERT").description("Owl detected").build();
        when(repository.findByEventId(EVENT_ID)).thenReturn(Optional.of(event));
        when(repository.save(any(BirdTrackingLog.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(storage.getPresignedImageUrl("alerts/2026-11-11/cam-01/" + EVENT_ID + ".jpg"))
                .thenReturn("https://images.example/alert.jpg");
    }

    @Test
    void imageDeliveryQueuesTelegramWithoutBlockingMqttAndDoesNotNotifySuccessfulDuplicate() {
        String payload = """
                {"eventId":"%s","snapshotKey":"alerts/2026-11-11/cam-01/%s.jpg"}
                """.formatted(EVENT_ID, EVENT_ID);
        service.process("swiftletcare/house-01/cam-01/alert-image", payload);

        assertEquals(1, queuedTasks.size());
        verifyNoInteractions(telegram);

        when(telegram.sendText("Owl detected")).thenReturn(true);
        when(telegram.sendImage("https://images.example/alert.jpg")).thenReturn(true);
        queuedTasks.remove(0).run();
        assertTrue(event.isTelegramTextNotified());
        assertTrue(event.isTelegramNotified());
        assertEquals(1, event.getTelegramAttempts());
        assertEquals("text and image accepted by Telegram", event.getTelegramLastResult());

        service.process("swiftletcare/house-01/cam-01/alert-image", payload);
        assertTrue(queuedTasks.isEmpty());
        verify(telegram, times(1)).sendText("Owl detected");
        verify(telegram, times(1)).sendImage("https://images.example/alert.jpg");
    }

    @Test
    void imageRetryDoesNotRepeatTextThatTelegramAlreadyAccepted() {
        String payload = """
                {"eventId":"%s","snapshotKey":"alerts/2026-11-11/cam-01/%s.jpg"}
                """.formatted(EVENT_ID, EVENT_ID);
        when(telegram.sendText("Owl detected")).thenReturn(true);
        when(telegram.sendImage("https://images.example/alert.jpg")).thenReturn(false, true);

        service.process("swiftletcare/house-01/cam-01/alert-image", payload);
        queuedTasks.remove(0).run();
        assertTrue(event.isTelegramTextNotified());
        assertEquals(1, event.getTelegramAttempts());
        assertEquals("text accepted; Telegram rejected image", event.getTelegramLastResult());

        service.process("swiftletcare/house-01/cam-01/alert-image", payload);
        queuedTasks.remove(0).run();
        assertTrue(event.isTelegramNotified());
        assertEquals(2, event.getTelegramAttempts());
        verify(telegram, times(1)).sendText("Owl detected");
        verify(telegram, times(2)).sendImage("https://images.example/alert.jpg");
    }
}
