package com.swiftletcare.backend.modules.notification.service;

public class TelegramChatAlreadyLinkedException extends RuntimeException {
    public TelegramChatAlreadyLinkedException() {
        super("This Telegram chat is already linked to another account");
    }
}
