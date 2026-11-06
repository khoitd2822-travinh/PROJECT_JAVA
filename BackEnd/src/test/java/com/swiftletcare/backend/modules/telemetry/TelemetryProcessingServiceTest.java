package com.swiftletcare.backend.modules.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.telemetry.dto.TelemetryPayloadDTO;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetry;
import com.swiftletcare.backend.modules.telemetry.entity.SensorTelemetryId;
import com.swiftletcare.backend.modules.telemetry.repository.SensorTelemetryRepository;
import com.swiftletcare.backend.modules.telemetry.service.TelemetryProcessingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Nhóm test "Telemetry" của mục 13 - kiểm thử tích hợp.
 *
 * Bao phủ (theo ma trận test):
 * - JSON sai (malformed)
 * - Thiếu ID
 * - Thiếu số đo
 * - Nhiều khu vực (farm/zone khác nhau)
 * - Phân biệt lỗi parse, lỗi database và lỗi Redis
 */
@DisplayName("Mục 13 - Telemetry: xử lý gói tin MQTT")
@DisplayNameGeneration(org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores.class)
@TestMethodOrder(MethodOrderer.MethodName.class)
class TelemetryProcessingServiceTest {

    private SensorTelemetryRepository telemetryRepository;
    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private ObjectMapper objectMapper;
    private TelemetryProcessingService service;

    private static final String TOPIC = "swiftlet/thanhliem/1/1/ESP32_MAIN_01/telemetry";

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        telemetryRepository = mock(SensorTelemetryRepository.class);
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        objectMapper = new ObjectMapper();

        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        service = new TelemetryProcessingService(telemetryRepository, redisTemplate, objectMapper);
    }

    @Nested
    @DisplayName("Payload hợp lệ")
    class ValidPayload {

        @Test
        @DisplayName("Lưu bản ghi vào TimescaleDB và ghi cache Redis")
        void shouldPersistAndCacheValidPayload() {
            String payload = """
                    {
                      "deviceId": "ESP32_MAIN_01",
                      "farmId": 1,
                      "zoneId": 1,
                      "temp": 28.4,
                      "hum": 72.1,
                      "co2": 620,
                      "light": 35,
                      "sound": 65.5,
                      "relays": { "mist": 0, "fan": 1, "heat": 0, "alarm": 0 }
                    }
                    """;

            service.processTelemetryMessage(TOPIC, payload);

            ArgumentCaptor<SensorTelemetry> captor = ArgumentCaptor.forClass(SensorTelemetry.class);
            verify(telemetryRepository, times(1)).save(captor.capture());
            SensorTelemetry saved = captor.getValue();

            assertEquals("ESP32_MAIN_01", saved.getId().getDeviceId());
            assertEquals(1L, saved.getFarmId());
            assertEquals(1L, saved.getZoneId());
            assertEquals(28.4, saved.getTemperature(), 0.001);
            assertEquals(72.1, saved.getHumidity(), 0.001);
            assertEquals(620, saved.getCo2Level());
            assertEquals(35, saved.getLightLevel());
            assertEquals(65.5, saved.getSoundDb(), 0.001);
            assertTrue(saved.getFanState());
            assertFalse(saved.getMistState());
            assertFalse(saved.getHeaterState());
            assertFalse(saved.getAlarmState());

            verify(valueOperations, times(1)).set(
                    eq("telemetry:latest:1:1"), eq(payload), eq(Duration.ofMinutes(5)));
        }

        @Test
        @DisplayName("Bóc tách relays lồng nhau thành trạng thái từng relay")
        void shouldUnpackNestedRelays() {
            String payload = """
                    {
                      "deviceId": "ESP32_MAIN_02", "farmId": 2, "zoneId": 3,
                      "temp": 30.0, "hum": 80.0, "co2": 900, "light": 10,
                      "relays": { "mist": 1, "fan": 1, "heat": 1, "alarm": 1 }
                    }
                    """;

            service.processTelemetryMessage(TOPIC, payload);

            ArgumentCaptor<SensorTelemetry> captor = ArgumentCaptor.forClass(SensorTelemetry.class);
            verify(telemetryRepository).save(captor.capture());
            SensorTelemetry saved = captor.getValue();

            assertTrue(saved.getMistState());
            assertTrue(saved.getFanState());
            assertTrue(saved.getHeaterState());
            assertTrue(saved.getAlarmState());
            verify(valueOperations).set(eq("telemetry:latest:2:3"), anyString(), any(Duration.class));
        }

        @Test
        @DisplayName("Giữ trạng thái tắt khi giá trị relay là 0")
        void shouldKeepRelayOffWhenStateIsZero() {
            String payload = """
                    {
                      "deviceId": "ESP32_MAIN_03", "farmId": 1, "zoneId": 1,
                      "temp": 25.0, "hum": 60.0,
                      "relays": { "mist": 0, "fan": 0, "heat": 0, "alarm": 0 }
                    }
                    """;

            service.processTelemetryMessage(TOPIC, payload);

            ArgumentCaptor<SensorTelemetry> captor = ArgumentCaptor.forClass(SensorTelemetry.class);
            verify(telemetryRepository).save(captor.capture());
            SensorTelemetry saved = captor.getValue();

            assertFalse(saved.getMistState());
            assertFalse(saved.getFanState());
            assertFalse(saved.getHeaterState());
            assertFalse(saved.getAlarmState());
        }
    }

    @Nested
    @DisplayName("Dữ liệu thiếu hoặc sai")
    class InvalidPayload {

        @Test
        @DisplayName("JSON sai định dạng: không lưu, không ghi cache, không làm sập service")
        void shouldIgnoreMalformedJson() {
            service.processTelemetryMessage(TOPIC, "{ this is not json ");

            verify(telemetryRepository, never()).save(any());
            verify(valueOperations, never()).set(anyString(), anyString(), any(Duration.class));
        }

        @Test
        @DisplayName("JSON rỗng: không lưu")
        void shouldIgnoreEmptyPayload() {
            service.processTelemetryMessage(TOPIC, "");
            verify(telemetryRepository, never()).save(any());
        }

        @ParameterizedTest(name = "JSON sai: {0}")
        @ValueSource(strings = {
                "[]",
                "null",
                "\"just a string\"",
                "123"
        })
        @DisplayName("JSON sai kiểu dữ liệu: không lưu")
        void shouldIgnoreWrongJsonType(String payload) {
            service.processTelemetryMessage(TOPIC, payload);
            verify(telemetryRepository, never()).save(any());
        }

        @Test
        @DisplayName("Thiếu deviceId: dùng giá trị mặc định, không ghi sai khu vực")
        void shouldFallbackDeviceIdWhenMissing() {
            String payload = """
                    { "farmId": 1, "zoneId": 1, "temp": 27.0, "hum": 70.0 }
                    """;

            service.processTelemetryMessage(TOPIC, payload);

            ArgumentCaptor<SensorTelemetry> captor = ArgumentCaptor.forClass(SensorTelemetry.class);
            verify(telemetryRepository).save(captor.capture());
            SensorTelemetry saved = captor.getValue();

            assertEquals("ESP32_ZONE_1", saved.getId().getDeviceId());
            assertEquals(1L, saved.getFarmId());
            assertEquals(1L, saved.getZoneId());
        }

        @Test
        @DisplayName("Thiếu số đo: số đo null được giữ nguyên, không tự bịa dữ liệu")
        void shouldNotFabricateMissingMeasurements() {
            String payload = """
                    { "deviceId": "ESP32_MAIN_04", "farmId": 1, "zoneId": 1, "temp": 27.0 }
                    """;

            service.processTelemetryMessage(TOPIC, payload);

            ArgumentCaptor<SensorTelemetry> captor = ArgumentCaptor.forClass(SensorTelemetry.class);
            verify(telemetryRepository).save(captor.capture());
            SensorTelemetry saved = captor.getValue();

            assertEquals(27.0, saved.getTemperature(), 0.001);
            assertNull(saved.getHumidity(), "Độ ẩm thiếu phải giữ null thay vì gán 0");
            assertNull(saved.getCo2Level());
            assertNull(saved.getLightLevel());
        }

        @Test
        @DisplayName("Thiếu số đo âm thanh: dùng giá trị mặc định 65.0 theo hợp đồng hiện tại")
        void shouldDefaultSoundWhenMissing() {
            String payload = """
                    { "deviceId": "ESP32_MAIN_05", "farmId": 1, "zoneId": 1, "temp": 27.0 }
                    """;

            service.processTelemetryMessage(TOPIC, payload);

            ArgumentCaptor<SensorTelemetry> captor = ArgumentCaptor.forClass(SensorTelemetry.class);
            verify(telemetryRepository).save(captor.capture());
            assertEquals(65.0, captor.getValue().getSoundDb(), 0.001);
        }
    }

    @Nested
    @DisplayName("Nhiều khu vực")
    class MultipleZones {

        @Test
        @DisplayName("Mỗi farm/zone ghi vào một key Redis riêng")
        void shouldUseSeparateRedisKeyPerFarmZone() {
            service.processTelemetryMessage(TOPIC, """
                    { "deviceId": "A", "farmId": 1, "zoneId": 1, "temp": 27.0 }
                    """);
            service.processTelemetryMessage(TOPIC, """
                    { "deviceId": "B", "farmId": 2, "zoneId": 3, "temp": 28.0 }
                    """);

            verify(valueOperations).set(eq("telemetry:latest:1:1"), anyString(), eq(Duration.ofMinutes(5)));
            verify(valueOperations).set(eq("telemetry:latest:2:3"), anyString(), eq(Duration.ofMinutes(5)));
            verify(telemetryRepository, times(2)).save(any());
        }
    }

    @Nested
    @DisplayName("Phân biệt lỗi parse, database và Redis")
    class ErrorIsolation {

        @Test
        @DisplayName("Lỗi database: không ghi cache Redis, service không sập")
        void shouldNotCacheWhenDatabaseFails() {
            when(telemetryRepository.save(any(SensorTelemetry.class)))
                    .thenThrow(new RuntimeException("DB connection refused"));

            String payload = """
                    { "deviceId": "ESP32_MAIN_01", "farmId": 1, "zoneId": 1, "temp": 27.0 }
                    """;

            assertDoesNotThrow(() -> service.processTelemetryMessage(TOPIC, payload));
            verify(valueOperations, never()).set(anyString(), anyString(), any(Duration.class));
        }

        @Test
        @DisplayName("Lỗi Redis: bản ghi DB đã lưu vẫn giữ, service không sập")
        void shouldKeepDatabaseRecordWhenRedisFails() {
            org.mockito.Mockito.doThrow(new RuntimeException("Redis timeout"))
                    .when(valueOperations).set(anyString(), anyString(), any(Duration.class));

            String payload = """
                    { "deviceId": "ESP32_MAIN_01", "farmId": 1, "zoneId": 1, "temp": 27.0 }
                    """;

            assertDoesNotThrow(() -> service.processTelemetryMessage(TOPIC, payload));
            verify(telemetryRepository, times(1)).save(any());
        }
    }

    @Nested
    @DisplayName("Hợp đồng DTO")
    class DtoContract {

        @Test
        @DisplayName("Các khoá JSON đúng chuẩn TelemetryPayloadDTO")
        void shouldMatchDtoJsonPropertyNames() throws Exception {
            String payload = """
                    { "temp": 1.0, "hum": 2.0, "co2": 3, "light": 4, "sound": 5.0 }
                    """;

            TelemetryPayloadDTO dto = objectMapper.readValue(payload, TelemetryPayloadDTO.class);

            assertEquals(1.0, dto.getTemperature(), 0.001);
            assertEquals(2.0, dto.getHumidity(), 0.001);
            assertEquals(3, dto.getCo2());
            assertEquals(4, dto.getLight());
            assertEquals(5.0, dto.getSound(), 0.001);
        }

        @Test
        @DisplayName("Gói tin đúng chuẩn firmware: parse không lỗi")
        void shouldParseFirmwarePayload() throws Exception {
            String payload = """
                    {"deviceId":"ESP32_MAIN_01","farmId":1,"zoneId":1,"temp":28.4,"hum":72.1,\
                    "co2":620,"light":35,"sound":65.5,"relays":{"mist":0,"fan":1,"heat":0,"alarm":0}}
                    """;

            TelemetryPayloadDTO dto = objectMapper.readValue(payload, TelemetryPayloadDTO.class);

            assertEquals("ESP32_MAIN_01", dto.getDeviceId());
            assertEquals(1L, dto.getFarmId());
            assertEquals(1L, dto.getZoneId());
            assertEquals(1, dto.getFan());
            assertEquals(0, dto.getMist());
        }
    }
}
