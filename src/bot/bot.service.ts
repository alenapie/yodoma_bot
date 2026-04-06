import {
  Injectable,
  Inject,
  OnModuleInit,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { Bot } from "grammy";
import axios from "axios";
import { Pool } from "pg";

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
      throw new Error("❌ Отсутствуют переменные окружения!");
    }

    this.bot = new Bot(process.env.TELEGRAM_TOKEN);
  }

  async onModuleInit() {
    this.registerCommands();
  }

  async onApplicationBootstrap() {
    await this.setupWebhook();
  }

  private registerCommands() {
    // /quiz
    this.bot.command("quiz", async (ctx) => {
      const topic = ctx.message?.text?.slice("/quiz".length).trim() || "";
      try {
        const loading = await ctx.reply("Генерирую вопрос... ⏳");
        const quiz = await this.generateQuiz(topic);
        if (!quiz) throw new Error("Quiz пустой");

        // ✅ Исправлено: correct_option_ids как массив
        await ctx.replyWithPoll(quiz.question, quiz.options, {
          type: "quiz",
          correct_option_ids: [quiz.correctIndex],
          explanation: quiz.explanation,
          is_anonymous: false,
        });

        await ctx.api
          .deleteMessage(ctx.chat.id, loading.message_id)
          .catch(() => {});
      } catch (err: any) {
        console.error("Ошибка /quiz:", err.message);
        await ctx.reply("Не удалось создать вопрос 😔");
      }
    });

    // Обработка текста
    this.bot.on("message:text", async (ctx) => {
      const text = ctx.message?.text?.trim();
      if (!text) return;

      // едома что/кто
      const regexExplain =
        /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;
      const matchExplain = text.match(regexExplain);
      if (matchExplain) {
        const query = matchExplain[3].trim();
        try {
          await ctx.replyWithChatAction("typing");
          const explanation = await this.getWordExplanation(query);
          await ctx.reply(
            explanation.charAt(0).toUpperCase() + explanation.slice(1),
          );
        } catch (err: any) {
          console.error("Ошибка explain:", err.message);
          await ctx.reply("Не удалось найти информацию 😔");
        }
        return;
      }

      // едома кто
      const regexWho = /^едома кто\s+(.+)/i;
      const matchWho = text.match(regexWho);
      if (matchWho) {
        const query = matchWho[1].trim();
        try {
          await this.pool.query(
            `INSERT INTO participants(user_id, username, first_name, last_name)
             VALUES($1,$2,$3,$4)
             ON CONFLICT (user_id) DO NOTHING`,
            [
              ctx.message.from.id,
              ctx.message.from.username || null,
              ctx.message.from.first_name || null,
              ctx.message.from.last_name || null,
            ],
          );

          const { rows } = await this.pool.query<{
            username: string | null;
            first_name: string | null;
          }>(
            "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
          );

          if (rows.length === 0)
            return await ctx.reply("Нет участников в базе 😔");

          const user = rows[0];
          const display = user.username
            ? `@${user.username}`
            : `${user.first_name || "Неизвестный"}`;
          await ctx.reply(`${query} - ${display}`);
        } catch (err: any) {
          console.error("Ошибка выбора участника:", err.message);
          await ctx.reply("Не удалось выбрать участника 😔");
        }
        return;
      }

      // Сохраняем пользователя
      try {
        await this.pool.query(
          `INSERT INTO participants(user_id, username, first_name, last_name)
           VALUES($1,$2,$3,$4)
           ON CONFLICT (user_id) DO NOTHING`,
          [
            ctx.message.from.id,
            ctx.message.from.username || null,
            ctx.message.from.first_name || null,
            ctx.message.from.last_name || null,
          ],
        );
      } catch (err: any) {
        console.error("Ошибка добавления участника:", err.message);
      }
    });
  }

  private async setupWebhook() {
    try {
      await this.bot.api.deleteWebhook({ drop_pending_updates: true });
      const url = `${process.env.APP_URL}/bot/${process.env.TELEGRAM_TOKEN}`;
      await this.bot.api.setWebhook(url);
      console.log("✅ Webhook установлен:", url);
    } catch (err: any) {
      console.error("❌ Ошибка установки webhook:", err.message);
      throw err;
    }
  }

  private async generateQuiz(topic: string) {
    if (!topic.trim())
      topic =
        this.allowedTopics[
          Math.floor(Math.random() * this.allowedTopics.length)
        ];

    const systemPrompt = "Ты — генератор викторин. Отвечай строго JSON.";
    const userPrompt = `Создай 1 вопрос средней сложности по теме "${topic}". Формат:
{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": 0-3,
  "explanation": "..."
}`;

    try {
      const startTime = Date.now();
      const response = await axios.post<any>(
        "https://api.ai-mediator.ru/v1/chat/completions",
        {
          model: "gpt-5.2-chat-latest",
          temperature: 0.7,
          max_tokens: 600,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AI_MEDIATOR_API_KEY}`,
          },
          timeout: 60000,
        },
      );
      const endTime = Date.now();
      console.log(
        `✅ Викторина: модель "${response.data.model}" отработала за ${
          endTime - startTime
        }ms`,
      );

      let content = response.data.choices?.[0]?.message?.content?.trim() || "";
      content = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      return JSON.parse(content);
    } catch (err: any) {
      console.error("Ошибка генерации викторины:", err.message);
      throw err;
    }
  }

  private async getWordExplanation(query: string) {
    const systemPrompt = `
Ты — энциклопедический справочник.
Пиши нейтральным стилем, как в Википедии.
Без сленга.
Без повторения термина в начале.
Без кавычек.
1–3 предложения.
Если информации нет — пиши: "Нет достоверной информации".
`;
    const userPrompt = `Дай краткое энциклопедическое объяснение по типу "*слово* - это...": ${query}`;

    try {
      const startTime = Date.now();
      const response = await axios.post<any>(
        "https://api.ai-mediator.ru/v1/chat/completions",
        {
          model: "gpt-5.2-chat-latest",
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.AI_MEDIATOR_API_KEY}`,
          },
          timeout: 60000,
        },
      );
      const endTime = Date.now();
      console.log(
        `✅ Энциклопедия: модель "${response.data.model}" отработала за ${
          endTime - startTime
        }ms`,
      );

      let content =
        response.data.choices?.[0]?.message?.content?.trim() ||
        "Нет достоверной информации";
      content = content
        .replace(/^```.*?\n?/g, "")
        .replace(/```$/g, "")
        .trim();
      return content;
    } catch (err: any) {
      console.error("Ошибка получения объяснения:", err.message);
      return "Нет достоверной информации";
    }
  }

  public getBot() {
    return this.bot;
  }
}
