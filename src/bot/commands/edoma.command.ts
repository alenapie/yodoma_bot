import { Bot, Context } from "grammy";
import { Pool } from "pg";

export class EdomaCommand {
  constructor(
    private bot: Bot,
    private pool: Pool,
  ) {
    this.register();
  }

  private register() {
    this.bot.on("message:text", async (ctx: Context) => {
      console.log("🔹 Получено сообщение:", ctx.message?.text);

      // Проверяем, что это сообщение с текстом
      if (!ctx.message || !ctx.message.text) {
        console.log("⚠️ ctx.message или текст отсутствует");
        return;
      }

      const text = ctx.message.text.trim();

      // Проверяем команду "едома кто"
      const matchWho = text.match(/^едома кто\s+(.+)/i);
      if (!matchWho) return;

      const query = matchWho[1].trim();
      if (!query) {
        console.log("⚠️ Не удалось извлечь слово после 'едома кто'");
        return;
      }

      console.log("🔹 Команда 'едома кто' с запросом:", query);

      try {
        // Сохраняем пользователя в базу
        await this.pool.query(
          `INSERT INTO participants(user_id, username, first_name, last_name)
           VALUES($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
          [
            ctx.message.from.id,
            ctx.message.from.username || null,
            ctx.message.from.first_name || null,
            ctx.message.from.last_name || null,
          ],
        );
        console.log(
          "✅ Пользователь добавлен или уже есть в базе:",
          ctx.message.from.id,
        );

        // Выбираем случайного участника
        const { rows } = await this.pool.query(
          "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
        );
        if (!rows.length) {
          console.log("⚠️ В базе нет участников");
          await ctx.reply("Нет участников в базе 😔");
          return;
        }

        const user = rows[0];
        const display = user.username
          ? `@${user.username}`
          : `${user.first_name || "Неизвестный"}`;

        console.log("🔹 Выбран пользователь:", display);

        await ctx.reply(`${query} - ${display}`);
      } catch (err: any) {
        console.error("❌ Ошибка при выполнении 'едома кто':", err.message);
        await ctx.reply("Не удалось выбрать участника 😔");
      }
    });
  }
}
