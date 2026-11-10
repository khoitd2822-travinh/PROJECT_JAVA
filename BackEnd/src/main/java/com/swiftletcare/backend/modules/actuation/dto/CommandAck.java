package com.swiftletcare.backend.modules.actuation.dto;

import java.util.UUID;

public record CommandAck(
        UUID commandId,
        String boardId,
        String target,
        Boolean success,
        Integer state,
        String mode,
        String message) {

}