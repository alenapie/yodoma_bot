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
  private explainCommand!: ExplainCommand;
  private edomaCommand!: EdomaCommand;
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
    this.explainCommand = new ExplainCommand();
    this.edomaCommand = new EdomaCommand(this.pool);

    // Единый роутер текстовых команд, чтобы не было конфликтов middleware
    this.bot.on("message:text", async (ctx) => {
      const text = ctx.message?.text?.trim();
      if (!text) return;

      if (this.explainCommand.isMatch(text)) {
        await this.explainCommand.handle(ctx, text);
        return;
      }

      if (this.edomaCommand.isMatch(text)) {
        await this.edomaCommand.handle(ctx, text);
        return;
      }
    });
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
