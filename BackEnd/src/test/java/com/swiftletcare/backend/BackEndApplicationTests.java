package com.swiftletcare.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.integration.core.MessageProducer;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

/**
 * Smoke test: ứng dụng Spring Boot khởi động được trong môi trường test.
 *
 * <p>Trước đây test này dùng {@code @SpringBootTest} thuần nên luôn fail khi
 * không có sẵn PostgreSQL/Redis/MQTT — nghĩa là {@code mvn test} không chạy được
 * trên máy không bật Docker. Đây là một trong các vấn đề được ghi nhận ở
 * {@code docs/testing/test-matrix.md} (nhóm 13 — kiểm thử tài liệu còn thiếu).
 *
 * <p>Phiên bản này dùng H2 in-memory và mock bean MQTT để context vẫn nạp được.
 * Những test cần hạ tầng thật được đánh dấu bằng {@code @Tag("integration")}
 * và chạy riêng.
 *
 * @see com.swiftletcare.backend.modules.telemetry.TelemetryProcessingServiceTest
 * @see com.swiftletcare.backend.modules.actuation.ActuationCommandContractTest
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
        // Dùng H2 in-memory để không phụ thuộc PostgreSQL khi chạy unit test.
        "spring.datasource.url=jdbc:h2:mem:swiftlet_test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        // Redis: giữ auto-configuration (cần StringRedisTemplate) nhưng không
        // kết nối thật — connection được lazy nên context vẫn nạp được.
        "spring.data.redis.repositories.enabled=false"
})
class BackEndApplicationTests {

    /** Mock adapter MQTT để không cần broker EMQX thật khi nạp context. */
    @MockBean(name = "telemetryInbound")
    MessageProducer telemetryInbound;

    @Test
    void contextLoads() {
        // Nếu context nạp được thì toàn bộ bean đã được tạo thành công.
    }
}
