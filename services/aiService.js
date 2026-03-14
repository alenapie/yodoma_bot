const axios = require("axios");

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

async function generateQuiz(topic = "") {
  if (!topic.trim()) {
    topic = allowedTopics[Math.floor(Math.random() * allowedTopics.length)];
  }

  const systemPrompt = `
Ты — генератор викторин.
Отвечай строго одним валидным JSON.
Без текста вне JSON.
`;

  const userPrompt = `
Создай 1 вопрос средней сложности по теме "${topic}".
Формат:
{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": 0-3,
  "explanation": "..."
}
`;

  const response = await axios.post(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      model: "gpt-4o-mini",
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
    },
  );

  let content = response.data.choices?.[0]?.message?.content?.trim() || "";

  content = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(content);
}

async function getWordExplanation(query) {
  const systemPrompt = `
Ты — энциклопедический справочник.
Пиши нейтральным стилем, как в Википедии.
Без сленга.
Без повторения термина в начале.
Без кавычек.
1–3 предложения.
Если информации нет — пиши: "Нет достоверной информации".
`;

  const userPrompt = `
Дай краткое энциклопедическое объяснение по типу "*слово* - это...":
${query}
`;

  const response = await axios.post(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      model: "gpt-4o-mini",
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

module.exports = {
  generateQuiz,
  getWordExplanation,
};
