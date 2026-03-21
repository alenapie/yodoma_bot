import { Bot } from "grammy";
import pool from "../services/db.js";
import { generateQuiz } from "../services/quiz.js";
import { getWordExplanation } from "../services/encyclopedia.js";

export const bot = new Bot(process.env.TELEGRAM_TOKEN, {
  client: { timeout: 60000 },
});

export function setupBot() {
  // /quiz
  bot.command("quiz", async (ctx) => {
    const topic = ctx.message.text.slice("/quiz".length).trim();
    try {
      const loading = await ctx.reply("Генерирую вопрос... ⏳");
      const quiz = await generateQuiz(topic);
      await ctx.replyWithPoll(quiz.question, quiz.options, {
        type: "quiz",
        correct_option_id: quiz.correctIndex,
        explanation: quiz.explanation,
        is_anonymous: false,
      });
      await ctx.api
        .deleteMessage(ctx.chat.id, loading.message_id)
        .catch(() => {});
    } catch (err) {
      console.error(err);
      await ctx.reply("Не удалось создать вопрос 😔");
    }
  });

  // текстовые сообщения
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();

    // Энциклопедия
    const regexExplain =
      /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;
    const matchExplain = text.match(regexExplain);
    if (matchExplain) {
      const query = matchExplain[3].trim();
      try {
        await ctx.replyWithChatAction("typing");
        const explanation = await getWordExplanation(query);
        await ctx.reply(
          explanation.charAt(0).toUpperCase() + explanation.slice(1),
        );
      } catch (err) {
        console.error(err);
        await ctx.reply("Не удалось найти информацию 😔");
      }
      return;
    }

    // едома кто
    const regexWho = /^едома кто\s+(.+)/i;
    const matchWho = text.match(regexWho);
    if (!matchWho) return;

    const query = matchWho[1].trim();
    const user = ctx.message.from;

    try {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM participants WHERE user_id=$1 AND chat_id=$2`,
        [user.id, ctx.chat.id],
      );
      if (!rowCount)
        await pool.query(
          `INSERT INTO participants(user_id, chat_id, username, first_name, last_name)
         VALUES($1,$2,$3,$4,$5)`,
          [
            user.id,
            ctx.chat.id,
            user.username || null,
            user.first_name || null,
            user.last_name || null,
          ],
        );

      const { rows } = await pool.query(
        `SELECT username, first_name FROM participants WHERE chat_id=$1 ORDER BY RANDOM() LIMIT 1`,
        [ctx.chat.id],
      );
      if (!rows.length) return await ctx.reply("Нет участников в базе 😔");

      const randomUser = rows[0];
      const display = randomUser.username
        ? `@${randomUser.username}`
        : randomUser.first_name || "Неизвестный";
      await ctx.reply(`${query} - ${display}`);
    } catch (err) {
      console.error(err);
      await ctx.reply("Не удалось выбрать участника 😔");
    }
  });

  return bot;
}
