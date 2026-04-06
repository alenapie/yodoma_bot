import { Context } from "grammy";
import axios from "axios";

export class ExplainCommand {
  private readonly regexExplain =
    /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;

  public isMatch(text: string) {
    return this.regexExplain.test(text.trim());
  }

  public async handle(ctx: Context, text: string) {
    const match = text.trim().match(this.regexExplain);
    if (!match) return;

    const query = match[3].trim();
    try {
      await ctx.replyWithChatAction("typing");
      const explanation = await this.getWordExplanation(query);
      await ctx.reply(explanation.charAt(0).toUpperCase() + explanation.slice(1));
    } catch (err: any) {
      console.error("Ошибка /explain:", err.message);
      await ctx.reply("Не удалось найти информацию 😔");
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
    const response = await axios.post(
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

    let content =
      response.data.choices?.[0]?.message?.content?.trim() ||
      "Нет достоверной информации";
    content = content
      .replace(/^```.*?\n?/g, "")
      .replace(/```$/g, "")
      .trim();
    return content;
  }
}
