import axios from "axios";

export async function getWordExplanation(query) {
  const systemPrompt = `
Ты — энциклопедический справочник.
Пиши нейтральным стилем, 1–3 предложения.
Если нет информации — пиши: "Нет достоверной информации".
`;

  const userPrompt = `Дай краткое объяснение: ${query}`;

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
        Authorization: `Bearer ${process.env.AI_MEDIATOR_API_KEY}`,
      },
      timeout: 60000,
    },
  );

  let content =
    response.data.choices?.[0]?.message?.content?.trim() ||
    "Нет достоверной информации";

  return content;
}
