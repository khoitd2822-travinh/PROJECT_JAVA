package com.swiftletcare.backend.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    @Value("${s3.endpoint}")
    private String endpoint;

    @Value("${s3.public-endpoint:}")
    private String publicEndpoint;

    @Value("${s3.access-key}")
    private String accessKey;

    @Value("${s3.secret-key}")
    private String secretKey;

    @Bean
    public MinioClient minioClient() {
        return createClient(endpoint);
    }

    @Bean("publicMinioClient")
    public MinioClient publicMinioClient() {
        return createClient(publicEndpoint.isBlank() ? endpoint : publicEndpoint);
    }

    private MinioClient createClient(String clientEndpoint) {
        return MinioClient.builder()
                .endpoint(clientEndpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}