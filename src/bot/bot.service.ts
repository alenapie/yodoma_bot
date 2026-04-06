import {
  Injectable,
  Inject,
  OnModuleInit,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { Bot } from "grammy";
import { Pool } from "pg";

// Команды
import { QuizCommand } from "./commands/quiz.command";
import { ExplainCommand } from "./commands/explain.command";
import { EdomaCommand } from "./commands/edoma.command";

@Injectable()
export class BotService implements OnModuleInit, OnApplicationBootstrap {
  private bot: Bot;
  private allowedTopics = [
    "история",
    "география",
    "страны",
    "столицы",
    "животные",
    "еда",
    "спорт",
    "музыка",
    "кино",
    "литература",
    "искусство",
    "знаменитости",
    "путешествия",
    "традиции",
    "праздники",
  ];

  constructor(@Inject("PG_POOL") private readonly pool: Pool) {
    if (
      !process.env.TELEGRAM_TOKEN ||
      !process.env.AI_MEDIATOR_API_KEY ||
      !process.env.APP_URL
    ) {
      console.error("❌ Отсутствуют переменные окружения!");
      process.exit(1);
    }
    this.bot = new Bot(process.env.TELEGRAM_TOKEN);
  }

  async onModuleInit() {
    // Регистрируем команды
    new QuizCommand(this.bot, this.pool, this.allowedTopics);
    new EdomaCommand(this.bot, this.pool);
    new ExplainCommand(this.bot);
  }

  async onApplicationBootstrap() {
    await this.setupWebhook();
  }

  private async setupWebhook() {
    try {
      await this.bot.api.deleteWebhook({ drop_pending_updates: true });
      const url = `${process.env.APP_URL}/bot/${process.env.TELEGRAM_TOKEN}`;
      await this.bot.api.setWebhook(url);
      console.log("✅ Webhook установлен:", url);
    } catch (err: any) {
      console.error("❌ Ошибка установки webhook:", err.message);
    }
  }

  public getBot() {
    return this.bot;
  }
}
