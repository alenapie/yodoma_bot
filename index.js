require("dotenv").config();
const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const axios = require("axios");

// ──────────────────────────────────────────────
// Проверка обязательных переменных
// ──────────────────────────────────────────────
console.log(
  "TELEGRAM_TOKEN:     ",
  process.env.TELEGRAM_TOKEN ? "присутствует" : "ОТСУТСТВУЕТ!"
);
console.log(
  "AI_MEDIATOR_API_KEY:",
  process.env.AI_MEDIATOR_API_KEY ? "присутствует" : "ОТСУТСТВУЕТ!"
);
console.log("APP_URL:            ", process.env.APP_URL || "не указан");

if (
  !process.env.TELEGRAM_TOKEN ||
  !process.env.AI_MEDIATOR_API_KEY ||
  !process.env.APP_URL
) {
  console.error("❌ Отсутствуют критические переменные окружения!");
  process.exit(1);
}

// ──────────────────────────────────────────────
// Инициализация Express и grammY Bot
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

const bot = new Bot(process.env.TELEGRAM_TOKEN);

// ──────────────────────────────────────────────
// Разрешённые темы
// ──────────────────────────────────────────────
const allowedTopics = [
  "история",
  "география",
  "страны",
  "столицы",
  "животные",
  "растения",
  "еда",
  "кухни мира",
  "спорт",
  "музыка",
  "кино",
  "сериалы",
  "литература",
  "искусство",
  "знаменитости",
  "психология",
  "мода",
  "автомобили",
  "путешествия",
  "традиции",
  "праздники",
];

// ──────────────────────────────────────────────
// Генерация вопроса (без изменений)
// ──────────────────────────────────────────────
async function generateQuiz(topic = "") {
  const isRandom = !topic.trim();
  if (isRandom)
    topic = allowedTopics[Math.floor(Math.random() * allowedTopics.length)];

  const systemPrompt = `Ты — генератор вопросов для викторин.
Отвечай ТОЛЬКО одним валидным JSON-объектом.
Никакого текста вне JSON.
Никогда не используй темы: химия, физика, математика, программирование.`;

  const userPrompt = `Сгенерируй ровно ОДИН вопрос викторины средней сложности строго по теме "${topic}".
Формат строго JSON:
{
  "question": "текст вопроса",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": число от 0 до 3,
  "explanation": "короткое объяснение"
}`;

  try {
    console.log("[GENERATE] Запущена генерация, тема:", topic);

    const response = await axios.post(
      "https://api.ai-mediator.ru/v1/chat/completions",
      {
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.5,
        max_tokens: 700,
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
      }
    );

    let content = response.data.choices?.[0]?.message?.content?.trim() || "";
    content = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const quiz = JSON.parse(content);

    if (
      typeof quiz.question !== "string" ||
      !Array.isArray(quiz.options) ||
      quiz.options.length !== 4 ||
      !Number.isInteger(quiz.correctIndex) ||
      quiz.correctIndex < 0 ||
      quiz.correctIndex > 3 ||
      typeof quiz.explanation !== "string"
    ) {
      throw new Error("AI вернул неправильную структуру вопроса");
    }

    return quiz;
  } catch (err) {
    console.error("[Генерация вопроса] Ошибка:", err.message);
    throw err;
  }
}

// ──────────────────────────────────────────────
// Обработчик команды /quiz
// ──────────────────────────────────────────────
bot.command("quiz", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  let topic = text.slice("/quiz".length).trim();

  try {
    console.log("[WEBHOOK] /quiz от", chatId, "тема:", topic || "случайная");

    const loadingMsg = await ctx.api.sendMessage(
      chatId,
      "Генерирую вопрос... ⏳"
    );

    const quiz = await generateQuiz(topic);

    await ctx.api.sendPoll(chatId, quiz.question, quiz.options, {
      type: "quiz",
      correct_option_id: quiz.correctIndex, // ← здесь correct_option_id, а не correctIndex!
      explanation: quiz.explanation,
      is_anonymous: false,
      protects_content: false,
    });

    await ctx.api.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    console.log("[WEBHOOK] Опрос успешно отправлен");
  } catch (err) {
    console.error("[WEBHOOK] Ошибка:", err.message || err);
    await ctx.api
      .sendMessage(chatId, "Не удалось создать вопрос 😔\nПопробуй позже.")
      .catch(() => {});
  }
});

// ──────────────────────────────────────────────
// Webhook для Express
// ──────────────────────────────────────────────
app.use(`/bot${process.env.TELEGRAM_TOKEN}`, webhookCallback(bot, "express"));

// ──────────────────────────────────────────────
// Health-check и главная страница
// ──────────────────────────────────────────────
app.get("/", (req, res) => res.send("Бот на grammY работает. Всё ок!"));
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "жив",
    uptime: Math.floor(process.uptime() / 60) + " минут",
  });
});

// Heartbeat
setInterval(() => {
  console.log(`Бот жив | uptime ${Math.floor(process.uptime() / 60)} мин`);
}, 50000);

// ──────────────────────────────────────────────
// Установка webhook при запуске
// ──────────────────────────────────────────────
async function установитьWebhook() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    const url = `${process.env.APP_URL}/bot${process.env.TELEGRAM_TOKEN}`;
    await bot.api.setWebhook(url);
    console.log("Webhook успешно установлен →", url);
  } catch (err) {
    console.error("Ошибка при установке webhook:", err.message || err);
  }
}

установитьWebhook();

// ──────────────────────────────────────────────
// Запуск сервера
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
