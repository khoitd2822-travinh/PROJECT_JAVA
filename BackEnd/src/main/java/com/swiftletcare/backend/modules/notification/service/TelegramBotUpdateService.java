package com.swiftletcare.backend.modules.notification.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class TelegramBotUpdateService {
    private static final String LINK_INSTRUCTIONS =
            "Để liên kết tài khoản, hãy đăng nhập SwiftletCare, vào mục Telegram và tạo mã liên kết. "
                    + "Sau đó gửi mã này cho bot trong vòng 10 phút.";
    private static final String HELP_TEXT =
            "Gửi mã liên kết được tạo trong SwiftletCare để kết nối tài khoản. Dùng /stop để ngắt kết nối.";

    private final TelegramLinkService telegramLinkService;
    private final TelegramNotificationService telegramNotificationService;

    public TelegramBotUpdateService(TelegramLinkService telegramLinkService,
                                    TelegramNotificationService telegramNotificationService) {
        this.telegramLinkService = telegramLinkService;
        this.telegramNotificationService = telegramNotificationService;
    }

    public void process(JsonNode update) {
        JsonNode message = update.path("message");
        JsonNode chat = message.path("chat");
        if (!"private".equals(chat.path("type").asText())
                || !chat.path("id").canConvertToLong()) {
            return;
        }

        String chatId = chat.path("id").asText();
        String text = message.path("text").asText("").trim();
        if (text.isEmpty()) return;

        String[] parts = text.split("\\s+", 2);
        String command = parts[0].replaceFirst("@.*$", "").toLowerCase(Locale.ROOT);
        String argument = parts.length == 2 ? parts[1].trim() : "";

        if ("/start".equals(command)) {
            if (argument.isEmpty()) {
                telegramNotificationService.sendTextToChat(chatId, LINK_INSTRUCTIONS);
            } else {
                linkChat(chatId, argument);
            }
            return;
        }
        if ("/link".equals(command)) {
            if (argument.isEmpty()) {
                telegramNotificationService.sendTextToChat(chatId, LINK_INSTRUCTIONS);
            } else {
                linkChat(chatId, argument);
            }
            return;
        }
        if ("/stop".equals(command)) {
            boolean unlinked = telegramLinkService.unlinkChat(chatId);
            telegramNotificationService.sendTextToChat(chatId, unlinked
                    ? "Đã ngắt liên kết Telegram. Bạn sẽ không nhận cảnh báo nữa."
                    : "Telegram này chưa được liên kết với tài khoản nào.");
            return;
        }
        if (command.startsWith("/")) {
            telegramNotificationService.sendTextToChat(chatId, HELP_TEXT);
            return;
        }

        linkChat(chatId, text);
    }

    private void linkChat(String chatId, String code) {
        try {
            if (telegramLinkService.linkChat(code, chatId)) {
                telegramNotificationService.sendTextToChat(chatId,
                        "Liên kết thành công. Bạn sẽ nhận cảnh báo SwiftletCare tại đây.");
            } else {
                telegramNotificationService.sendTextToChat(chatId,
                        "Mã không hợp lệ hoặc đã hết hạn. Hãy tạo mã mới trong SwiftletCare.");
            }
        } catch (TelegramChatAlreadyLinkedException exception) {
            telegramNotificationService.sendTextToChat(chatId,
                    "Telegram này đã được liên kết với một tài khoản khác. Hãy ngắt liên kết tài khoản đó trước.");
        }
    }
}
