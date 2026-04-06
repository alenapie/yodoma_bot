import { Bot } from "grammy";
import axios from "axios";
import { Pool } from "pg";

export class QuizCommand {
  constructor(
    private bot: Bot,
    private pool: Pool,
    private allowedTopics: string[],
  ) {
    bot.command("quiz", async (ctx) => {
      const topic = ctx.message?.text?.slice("/quiz".length).trim() || "";
      try {
        const loading = await ctx.reply("Генерирую вопрос... ⏳");
        const quiz = await this.generateQuiz(topic);
        const start = Date.now();
        await ctx.replyWithPoll(quiz.question, quiz.options, {
          type: "quiz",
          correct_option_ids: [quiz.correctIndex],
          explanation: quiz.explanation,
          is_anonymous: false,
        });
        const duration = Date.now() - start;
        console.log(
          `✅ Викторина: модель "gpt-5.2-chat-latest" отработала за ${duration}ms`,
        );
        await ctx.api
          .deleteMessage(ctx.chat.id, loading.message_id)
          .catch(() => {});
      } catch (err: any) {
        console.error("Ошибка /quiz:", err.message);
        await ctx.reply("Не удалось создать вопрос 😔");
      }
    });
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

    const response = await axios.post(
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

    let content = response.data.choices?.[0]?.message?.content?.trim() || "{}";
    content = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(content);
  }
}
