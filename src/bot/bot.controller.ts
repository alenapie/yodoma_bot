import { Controller, Post, Get, Req, Res } from "@nestjs/common";
import { BotService } from "./bot.service";
import { Request, Response } from "express";
import { webhookCallback } from "grammy";

@Controller()
export class BotController {
  constructor(private readonly botService: BotService) {}

  // Вебхук с динамическим токеном
  @Post("bot/:token")
  async handleUpdate(@Req() req: Request, @Res() res: Response) {
    const token = req.params.token;

    // Проверка токена, чтобы никто чужой не слал апдейты
    if (token !== process.env.TELEGRAM_TOKEN) {
      return res.sendStatus(403);
    }

    const bot = this.botService.getBot();
    return webhookCallback(bot, "express")(req, res);
  }

  @Get("/")
  root(@Res() res: Response) {
    res.send("Бот работает ✅");
  }

  @Get("/health")
  health(@Res() res: Response) {
    res.json({ status: "ok" });
  }
}
