import { Bot, Context } from "grammy";
import { Pool } from "pg";

export class EdomaCommand {
  constructor(
    private bot: Bot<Context>,
    private pool: Pool,
  ) {
    this.register();
  }

  private register() {
    this.bot.on("message", async (ctx: Context) => {
      if (!ctx.message?.text) return;

      const from = ctx.message.from;
      if (!from) return;

      const text = ctx.message.text.trim();
      console.log("Получен текст:", text);

      const match = text.match(/^едома кто\s+(.+)/i);
      if (!match) return;

      const query = match[1].trim();
      console.log("Запрос 'едома кто':", query);

      try {
        // Сохраняем пользователя
        await this.pool.query(
          `INSERT INTO participants(user_id, username, first_name, last_name)
           VALUES($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
          [
            from.id,
            from.username || null,
            from.first_name || null,
            from.last_name || null,
          ],
        );

        // Выбираем случайного участника
        const { rows } = await this.pool.query(
          "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
        );

        if (rows.length === 0) {
          await ctx.reply("Пока нет участников 😔");
          return;
        }

        const user = rows[0];
        const display = user.username
          ? `@${user.username}`
          : `${user.first_name || "Неизвестный"}`;
        console.log("Выбран участник:", display);

        await ctx.reply(`${query} - ${display}`);
      } catch (err: any) {
        console.error("Ошибка команды 'едома кто':", err.message);
        await ctx.reply("Не удалось выбрать участника 😔");
      }
    });
  }
}
