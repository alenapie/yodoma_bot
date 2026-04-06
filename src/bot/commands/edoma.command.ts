import { Context } from "grammy";
import { Pool } from "pg";

export class EdomaCommand {
  private readonly regexWho =
    /^(едома|ёдома)\s+кто(?!\s+такой)(?!\s+такая)(?!\s+что)[,:]?\s+(.+)/i;

  constructor(private pool: Pool) {
    console.log("✅ EdomaCommand инициализирован");
  }

  private normalize(text: string) {
    return text.replace(/^@\w+\s+/i, "").trim();
  }

  public isMatch(text: string) {
    return this.regexWho.test(this.normalize(text));
  }

  public async handle(ctx: Context, text: string) {
    const normalizedText = this.normalize(text);
    console.log("📩 EdomaCommand получил текст:", normalizedText);

    const match = normalizedText.match(this.regexWho);
    if (!match) return;

    const query = match[2].trim();
    console.log("🔍 Запрос 'едома кто':", query);

    await this.handleWhoRequest(ctx, query);
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
