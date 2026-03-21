import axios from "axios";

const allowedTopics = [
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

export async function generateQuiz(topic = "") {
  if (!topic.trim())
    topic = allowedTopics[Math.floor(Math.random() * allowedTopics.length)];

  const systemPrompt = `Ты — генератор викторин. Отвечай строго JSON.`;
  const userPrompt = `Создай 1 вопрос средней сложности по теме "${topic}". Формат JSON`;

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
      headers: { Authorization: `Bearer ${process.env.AI_MEDIATOR_API_KEY}` },
      timeout: 60000,
    },
  );

  let content = response.data.choices?.[0]?.message?.content?.trim() || "";
  content = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(content);
}
