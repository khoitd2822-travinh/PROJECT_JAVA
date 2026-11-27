package com.swiftletcare.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.integration.core.MessageProducer;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

/**
 * Smoke test: verifies the Spring Boot application context loads without
 * requiring live Docker services or colliding with a running EMQX backend client.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:swiftlet_test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.data.redis.repositories.enabled=false",
        "actuation.enabled=true"
})
class BackEndApplicationTests {

    @MockBean(name = "telemetryInbound")
    MessageProducer telemetryInbound;

    @MockBean(name = "birdTrackingInbound")
    MessageProducer birdTrackingInbound;

    @MockBean(name = "commandAckInbound")
    MessageProducer commandAckInbound;

    @Test
    void contextLoads() {
    }
}
