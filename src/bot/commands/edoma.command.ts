import { Bot } from "grammy";
import { Pool } from "pg";

export class EdomaCommand {
  constructor(bot: Bot, pool: Pool) {
    bot.on("message:text", async (ctx) => {
      const text = ctx.message?.text?.trim();
      if (!text) return;

      const regexWho = /^едома кто\s+(.+)/i;
      const match = text.match(regexWho);
      if (!match) return;

      const query = match[1].trim();
      try {
        // Сохраняем пользователя
        await pool.query(
          `INSERT INTO participants(user_id, username, first_name, last_name)
           VALUES($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
          [
            ctx.message.from.id,
            ctx.message.from.username || null,
            ctx.message.from.first_name || null,
            ctx.message.from.last_name || null,
          ],
        );

        // Выбираем случайного
        const { rows } = await pool.query(
          "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
        );
        const user = rows[0];
        const display = user.username
          ? `@${user.username}`
          : `${user.first_name || "Неизвестный"}`;
        await ctx.reply(`${query} - ${display}`);
      } catch (err: any) {
        console.error("Ошибка /edoma:", err.message);
        await ctx.reply("Не удалось выбрать участника 😔");
      }
    });
  }
}
