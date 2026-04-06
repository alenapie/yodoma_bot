import { Bot, Context } from "grammy";
import { Pool } from "pg";

export class EdomaCommand {
  constructor(
    private bot: Bot<Context>,
    private pool: Pool,
  ) {
    console.log("✅ EdomaCommand инициализирован"); // Проверка регистрации команды
    this.register();
  }

  private register() {
    // Ловим только текстовые сообщения
    this.bot.on("message:text", async (ctx: Context) => {
      const text = ctx.message?.text?.trim();

      if (!text) return;

      // В группах с анонимными админами поле from может отсутствовать
      // (вместо него приходит sender_chat), поэтому не выходим раньше времени.
      const normalizedText = text.replace(/^@\w+\s+/i, "").trim();

      console.log("📩 EdomaCommand получил текст:", normalizedText);

      // Регулярка для "едома/ёдома кто ..." (исключаем энциклопедические формы)
      const match = normalizedText.match(
        /^(едома|ёдома)\s+кто(?!\s+такой)(?!\s+такая)(?!\s+что)[,:]?\s+(.+)/i,
      );
      if (!match) return;

      const query = match[2].trim();
      console.log("🔍 Запрос 'едома кто':", query);

      await this.handleWhoRequest(ctx, query);
    });
  }

  private async handleWhoRequest(ctx: Context, query: string) {
    const from = ctx.message?.from;

    try {
      // Сохраняем пользователя в базе, если Telegram передал from
      if (from) {
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
        console.log("💾 Пользователь сохранён:", from.id);
      }

      // Выбираем случайного участника
      const { rows } = await this.pool.query(
        "SELECT username, first_name FROM participants ORDER BY RANDOM() LIMIT 1",
      );

      if (rows.length === 0) {
        console.log("⚠️ Нет участников в базе");
        await ctx.reply("Пока нет участников 😔");
        return;
      }

      const user = rows[0];
      const display = user.username
        ? `@${user.username}`
        : `${user.first_name || "Неизвестный"}`;
      console.log("🎯 Выбран участник:", display);

      await ctx.reply(`${query} - ${display}`);
    } catch (err: any) {
      console.error("❌ Ошибка команды 'едома кто':", err.message);
      await ctx.reply("Не удалось выбрать участника 😔");
    }
  }
}
