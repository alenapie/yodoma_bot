import { Controller, Post, Get, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { webhookCallback } from "grammy";
import { BotService } from "./bot.service";

@Controller()
export class BotController {
  constructor(private readonly botService: BotService) {}

  // Вебхук Telegram
  @Post(`/bot/${process.env.TELEGRAM_TOKEN}`)
  handleUpdate(@Req() req: Request, @Res() res: Response) {
    const bot = this.botService.getBot();
    return webhookCallback(bot, "express")(req, res);
  }

  @Get("/")
  root(@Res() res: Response) {
    res.send("Бот работает");
  }

  @Get("/health")
  health(@Res() res: Response) {
    res.json({ status: "ok" });
  }
}
