// src/bot/bot.controller.ts
import { Controller, Post, Get, Req, Res } from "@nestjs/common";
import { BotService } from "./bot.service";
import { Request, Response } from "express";
import { webhookCallback } from "grammy";

@Controller()
export class BotController {
  constructor(private readonly botService: BotService) {}

  // Обработка апдейтов от Telegram
  @Post("bot/:token")
  async handleUpdate(@Req() req: Request, @Res() res: Response) {
    const token = req.params.token;

    // Проверяем токен
    if (token !== process.env.TELEGRAM_TOKEN) {
      return res.sendStatus(403); // запрещено
    }

    try {
      // Передаем апдейт боту через webhookCallback
      const bot = this.botService.getBot();
      return webhookCallback(bot, "express")(req, res);
    } catch (err) {
      console.error("Ошибка обработки апдейта:", err);
      return res.sendStatus(500);
    }
  }

  // Проверка работы сервера
  @Get("/")
  root(@Res() res: Response) {
    res.send("Бот работает 🚀");
  }

  // Endpoint для health check
  @Get("/health")
  health(@Res() res: Response) {
    res.json({ status: "ok" });
  }
}
