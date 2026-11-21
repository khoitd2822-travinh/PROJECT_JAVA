package com.swiftletcare.backend.modules.actuation.entity;

public enum CommandStatus {
    PENDING,
    CONFIRMED,
    REJECTED,
    TIMED_OUT,
    PUBLISH_FAILED
}
