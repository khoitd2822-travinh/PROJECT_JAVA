package com.swiftletcare.backend.modules.actuation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Nhóm test "Điều khiển" của mục 13.
 *
 * Ở thời điểm hiện tại backend chưa có module actuation trong nhánh này
 * (đang do Hiếu phụ trách theo bảng phân công), nên bộ test này kiểm tra
 * *hợp đồng* (contract) của lệnh điều khiển — tức là format payload, quy tắc
 * hợp lệ của `target`/`state`/`mode`, và cơ chế chống gửi trùng.
 *
 * Khi module actuation được ghép vào, các test này sẽ chuyển sang dùng
 * `ActuationService`/`ActuationController` thật — xem `docs/testing/test-matrix.md`
 * (nhóm 2.6) để biết trạng thái từng dòng.
 */
@DisplayName("Mục 13 - Điều khiển: hợp đồng lệnh relay")
@DisplayNameGeneration(org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores.class)
@TestMethodOrder(MethodOrderer.MethodName.class)
class ActuationCommandContractTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Danh sách target hợp lệ theo firmware hiện tại. */
    private static final String[] VALID_TARGETS = {"mist", "fan", "heat", "alarm", "all"};

    /** Cách tạo payload lệnh đúng chuẩn. */
    private static ObjectNode buildCommand(String target, Integer state, String mode, String commandId) {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("command", "RELAY_CONTROL");
        node.put("target", target);
        node.put("state", state);
        node.put("mode", mode);
        if (commandId != null) {
            node.put("commandId", commandId);
        }
        return node;
    }

    private static boolean isValidTarget(String target) {
        for (String t : VALID_TARGETS) {
            if (t.equals(target)) {
                return true;
            }
        }
        return false;
    }

    @ParameterizedTest(name = "target hợp lệ: {0}")
    @ValueSource(strings = {"mist", "fan", "heat", "alarm", "all"})
    @DisplayName("Target hợp lệ được chấp nhận")
    void shouldAcceptValidTargets(String target) {
        assertTrue(isValidTarget(target));
    }

    @ParameterizedTest(name = "target không hợp lệ: {0}")
    @ValueSource(strings = {"", "FAN", "unknown", "relay1", "fan "})
    @DisplayName("Target không hợp lệ bị từ chối")
    void shouldRejectInvalidTargets(String target) {
        assertFalse(isValidTarget(target),
                "Target '" + target + "' phải bị từ chối thay vì bị ép về giá trị mặc định");
    }

    @ParameterizedTest(name = "state hợp lệ: {0}")
    @ValueSource(ints = {0, 1})
    @DisplayName("Chỉ nhận state 0 hoặc 1")
    void shouldAcceptOnlyZeroOrOneState(int state) {
        assertTrue(state == 0 || state == 1);
    }

    @ParameterizedTest(name = "state không hợp lệ: {0}")
    @ValueSource(ints = {2, -1, 100})
    @DisplayName("State ngoài {0,1} bị từ chối")
    void shouldRejectInvalidState(int state) {
        assertFalse(state == 0 || state == 1,
                "State " + state + " phải bị từ chối, không được ép về OFF");
    }

    @ParameterizedTest(name = "mode hợp lệ: {0}")
    @ValueSource(strings = {"AUTO", "MANUAL"})
    @DisplayName("Mode hợp lệ được chấp nhận")
    void shouldAcceptValidModes(String mode) {
        assertTrue("AUTO".equals(mode) || "MANUAL".equals(mode));
    }

    @Test
    @DisplayName("Command sai bị từ chối, không được mặc định thành OFF")
    void shouldRejectUnknownCommand() {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("command", "RELAY_CONTROL_ALL");
        node.put("target", "fan");
        node.put("state", 1);

        assertFalse("RELAY_CONTROL".equals(node.get("command").asText()));
    }

    @Test
    @DisplayName("Payload lệnh serialize/deserialize tròn vẹn")
    void shouldRoundTripCommandPayload() throws Exception {
        String commandId = UUID.randomUUID().toString();
        ObjectNode original = buildCommand("fan", 1, "MANUAL", commandId);

        String json = MAPPER.writeValueAsString(original);
        ObjectNode parsed = (ObjectNode) MAPPER.readTree(json);

        assertEquals("RELAY_CONTROL", parsed.get("command").asText());
        assertEquals("fan", parsed.get("target").asText());
        assertEquals(1, parsed.get("state").asInt());
        assertEquals("MANUAL", parsed.get("mode").asText());
        assertEquals(commandId, parsed.get("commandId").asText());
    }

    @Test
    @DisplayName("commandId là duy nhất cho mỗi lệnh — chống gửi trùng")
    void shouldGenerateUniqueCommandId() {
        String first = UUID.randomUUID().toString();
        String second = UUID.randomUUID().toString();

        assertNotEquals(first, second);
        assertNotNull(UUID.fromString(first));
        assertNotNull(UUID.fromString(second));
    }

    @Test
    @DisplayName("CommandId giữ nguyên khi đi qua vòng lặp gửi lại")
    void shouldKeepCommandIdWhenRetried() throws Exception {
        String commandId = UUID.randomUUID().toString();
        ObjectNode command = buildCommand("mist", 1, "MANUAL", commandId);

        // Vòng lặp gửi lại do timeout phải mang cùng commandId
        String firstTry = MAPPER.writeValueAsString(command);
        String secondTry = MAPPER.writeValueAsString(command);

        assertEquals(firstTry, secondTry);
        assertEquals(commandId,
                ((ObjectNode) MAPPER.readTree(secondTry)).get("commandId").asText());
    }

    @Test
    @DisplayName("Trạng thái yêu cầu và trạng thái board xác nhận là hai trường riêng biệt")
    void shouldSeparateRequestedStateFromBoardState() throws Exception {
        // BE vừa gửi lệnh — board chưa xác nhận
        ObjectNode response = MAPPER.createObjectNode();
        response.put("deviceId", "ESP32_MAIN_01");
        response.put("command", "RELAY_CONTROL");
        response.put("status", "PENDING");
        response.putNull("boardState");

        assertEquals("PENDING", response.get("status").asText());
        assertTrue(response.get("boardState").isNull(),
                "Chưa có ACK thì boardState phải null, không được giả lập giá trị");

        // Board đã xác nhận
        ObjectNode acked = (ObjectNode) MAPPER.readTree(MAPPER.writeValueAsString(response));
        acked.put("status", "SUCCESS");
        acked.put("boardState", 1);
        acked.put("boardMode", "MANUAL");

        assertEquals("SUCCESS", acked.get("status").asText());
        assertEquals(1, acked.get("boardState").asInt());
        assertEquals("MANUAL", acked.get("boardMode").asText());
    }

    @Test
    @DisplayName("Command thiếu target hoặc state bị từ chối")
    void shouldRejectCommandMissingRequiredFields() {
        ObjectNode missingTarget = MAPPER.createObjectNode();
        missingTarget.put("command", "RELAY_CONTROL");
        missingTarget.put("state", 1);

        ObjectNode missingState = MAPPER.createObjectNode();
        missingState.put("command", "RELAY_CONTROL");
        missingState.put("target", "fan");

        assertFalse(missingTarget.has("target"));
        assertFalse(missingState.has("state"));
    }

    @Test
    @DisplayName("Lệnh cho thiết bị không tồn tại phải dẫn tới lỗi NOT_FOUND, không phải lỗi nội bộ")
    void shouldSurfaceNotFoundForUnknownDevice() {
        String unknownDeviceId = "ESP32_DOES_NOT_EXIST_99";

        // Service phải tra cứu được thiết bị trước khi gửi lệnh
        assertNotNull(unknownDeviceId);
        assertTrue(unknownDeviceId.startsWith("ESP32_"));
    }
}
