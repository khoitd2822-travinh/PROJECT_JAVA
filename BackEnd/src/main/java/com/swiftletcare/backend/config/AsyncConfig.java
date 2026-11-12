package com.swiftletcare.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class AsyncConfig {
    @Bean("telegramRestTemplate")
    public RestTemplate telegramRestTemplate(RestTemplateBuilder builder,
                                             @Value("${telegram.bot.connect-timeout:3s}") Duration connectTimeout,
                                             @Value("${telegram.bot.read-timeout:5s}") Duration readTimeout) {
        return builder.setConnectTimeout(connectTimeout).setReadTimeout(readTimeout).build();
    }

    @Bean("notificationTaskExecutor")
    public ThreadPoolTaskExecutor notificationTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("notification-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        return executor;
    }
}
