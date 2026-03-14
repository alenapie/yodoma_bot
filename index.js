require("dotenv").config();
const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const axios = require("axios");

// ──────────────────────────────────────────────
// Проверка переменных
// ──────────────────────────────────────────────
if (
  !process.env.TELEGRAM_TOKEN ||
  !process.env.AI_MEDIATOR_API_KEY ||
  !process.env.APP_URL
) {
  console.error("❌ Отсутствуют переменные окружения!");
  process.exit(1);
}

const app = express();
app.use(express.json());

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// ──────────────────────────────────────────────
// Темы викторины
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Генерация викторины
// ──────────────────────────────────────────────
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

  const quiz = JSON.parse(content);
  return quiz;
}

// ──────────────────────────────────────────────
// Энциклопедическое объяснение
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// /quiz
// ──────────────────────────────────────────────
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
    console.error("Ошибка /quiz:", err.message);
    await ctx.reply("Не удалось создать вопрос 😔");
  }
});

// ──────────────────────────────────────────────
// Едома / Ёдома обработчик
// ──────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  const regex =
    /^(едома|ёдома)\s+(что такое|кто такой|кто такая|что это)\s+(.+)/i;

  const match = text.match(regex);
  if (!match) return;

  const query = match[3].trim();

  try {
    await ctx.replyWithChatAction("typing");

    const explanation = await getWordExplanation(query);

    await ctx.reply(explanation.charAt(0).toUpperCase() + explanation.slice(1));
  } catch (err) {
    console.error("Ошибка explain:", err.message);
    await ctx.reply("Не удалось найти информацию 😔");
  }
});

// ──────────────────────────────────────────────
// Webhook
// ──────────────────────────────────────────────
app.use(`/bot/${process.env.TELEGRAM_TOKEN}`, webhookCallback(bot, "express"));

app.get("/", (req, res) => res.send("Бот работает"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ──────────────────────────────────────────────
// Установка webhook
// ──────────────────────────────────────────────
async function setupWebhook() {
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  const url = `${process.env.APP_URL}/bot/${process.env.TELEGRAM_TOKEN}`;
  await bot.api.setWebhook(url);
  console.log("Webhook установлен:", url);
}

setupWebhook();

// ──────────────────────────────────────────────
// Запуск
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Сервер запущен на порту", PORT);
});
