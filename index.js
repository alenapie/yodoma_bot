require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ──────────────────────────────────────────────
//          Проверка обязательных переменных
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
//                Инициализация
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });

// ──────────────────────────────────────────────
//      Генерация вопроса (Claude-3-7-sonnet)
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

async function generateQuiz(topic = "") {
  const isRandom = !topic.trim();

  if (isRandom) {
    topic = allowedTopics[Math.floor(Math.random() * allowedTopics.length)];
  }

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

    const response = await fetch(
      "https://api.ai-mediator.ru/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_MEDIATOR_API_KEY}`,
        },
        body: JSON.stringify({
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.5,
          max_tokens: 700,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ошибка API: ${response.status} — ${errText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() || "";

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
//               Webhook для Telegram
// ──────────────────────────────────────────────
app.post(`/bot${process.env.TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // сразу отвечаем Telegram

  const update = req.body;
  if (!update?.message?.text?.startsWith("/quiz")) return;

  const chatId = update.message.chat.id;
  const text = update.message.text.trim();
  const topic = text.slice(5).trim();

  try {
    console.log("[WEBHOOK] /quiz от", chatId, "тема:", topic || "случайная");

    // Отправляем сообщение "генерация" и не ждём завершения webhook
    const loadingMsg = await bot.sendMessage(chatId, "Генерирую вопрос... ⏳");

    const quiz = await generateQuiz(topic);

    await bot.sendPoll(chatId, quiz.question, quiz.options, {
      type: "quiz",
      correct_option_id: quiz.correctIndex,
      explanation: quiz.explanation,
      is_anonymous: false,
      protects_content: false,
    });

    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    console.log("[WEBHOOK] Опрос отправлен");
  } catch (err) {
    console.error("[WEBHOOK] Ошибка:", err.message);
    bot
      .sendMessage(chatId, "Не удалось создать вопрос 😔\nПопробуй позже.")
      .catch(() => {});
  }
});

// ──────────────────────────────────────────────
//   Простые GET-эндпоинты для Render
// ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Бот на webhook работает. Всё в порядке!");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "жив",
    uptime: Math.floor(process.uptime() / 60) + " минут",
  });
});

// Heartbeat для логов
setInterval(() => {
  console.log(`Бот жив | uptime ${Math.floor(process.uptime() / 60)} мин`);
}, 50000);

// ──────────────────────────────────────────────
//               Установка webhook
// ──────────────────────────────────────────────
async function установитьWebhook() {
  const url = `${process.env.APP_URL}/bot${process.env.TELEGRAM_TOKEN}`;
  try {
    await bot.setWebHook(url);
    console.log(`Webhook успешно установлен → ${url}`);
  } catch (err) {
    console.error("Ошибка установки webhook:", err.message);
  }
}

установитьWebhook();

// ──────────────────────────────────────────────
//                   Запуск сервера
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен на порту ${PORT} (0.0.0.0)`);
});
