package com.swiftletcare.backend.modules.farm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.Data;

@Data
public class DeviceControlRequest {

    @NotNull(message = "deviceId là bắt buộc")
    @Positive(message = "deviceId phải lớn hơn 0")
    private Long deviceId;

    @NotBlank(message = "command là bắt buộc")
    @Pattern(regexp = "(?i)(ON|OFF|AUTO|MANUAL)", message = "command chỉ được là ON, OFF, AUTO hoặc MANUAL")
    private String command;
}