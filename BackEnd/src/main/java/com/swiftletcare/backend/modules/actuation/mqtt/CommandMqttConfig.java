package com.swiftletcare.backend.modules.actuation.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swiftletcare.backend.modules.actuation.dto.CommandAck;
import com.swiftletcare.backend.modules.actuation.service.CommandService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.core.MessageProducer;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.integration.mqtt.inbound.MqttPahoMessageDrivenChannelAdapter;
import org.springframework.integration.mqtt.support.DefaultPahoMessageConverter;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class CommandMqttConfig {
    private static final Logger log = LoggerFactory.getLogger(CommandMqttConfig.class);

    @Bean
    public MessageChannel commandAckInboundChannel() {
        return new DirectChannel();
    }

    @Bean
    public MessageProducer commandAckInbound(MqttPahoClientFactory factory, @Qualifier("commandAckInboundChannel") MessageChannel channel, @Value("${mqtt.client-id}") String clientId) {
        var adapter = new MqttPahoMessageDrivenChannelAdapter(clientId + "_command_ack", factory, "swiftlet/ack/1/1");
        adapter.setConverter(new DefaultPahoMessageConverter());
        adapter.setQos(1);
        adapter.setCompletionTimeout(5000);
        adapter.setOutputChannel(channel);
        return adapter;
    }

    @Bean
    @ServiceActivator(inputChannel = "commandAckInboundChannel")
    public MessageHandler commandAckHandler(ObjectMapper objectMapper, CommandService commandService) {
        return message -> {
            // ACK không được dùng retained để phát lại lúc BE reconnect.
            if (Boolean.TRUE.equals(message.getHeaders().get(MqttHeaders.RECEIVED_RETAINED))) {
                log.warn("Bỏ qua retained ACK");
                return;
            }

            try {
                if (!(message.getPayload() instanceof String payload)) {
                    log.warn("ACK payload không phải chuỗi JSON");
                    return;
                }

                CommandAck ack = objectMapper.readValue(payload, CommandAck.class);

                commandService.handleAck(ack);

            } catch (Exception exception) {
                log.error("Không xử lý được ACK: {}", exception.getMessage());
            }
        };
    }
}