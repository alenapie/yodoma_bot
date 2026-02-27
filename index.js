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
async function generateQuiz(topic = "") {
  const isRandom = !topic.trim();

  const systemPrompt = `Ты — генератор вопросов для викторин.
Отвечай ТОЛЬКО одним валидным JSON-объектом.
Никакого текста вне JSON, никаких ``json, никаких пояснений.
Нарушение = критическая ошибка.`;

  let userPrompt;

  if (isRandom) {
    userPrompt = `Сгенерируй ровно ОДИН вопрос викторины средней сложности на случайную тему.

Строго запрещено:
- химия, периодическая таблица, элементы, атомные номера
- физика, формулы, законы
- математика, уравнения
- программирование, алгоритмы

Выбирай темы: история, география, страны, столицы, животные, растения, еда, кухни мира, спорт, музыка, кино, сериалы, литература, искусство, знаменитости, психология, мода, автомобили, путешествия, традиции, праздники.

Формат строго JSON:
{
  "question": "текст вопроса",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": число от 0 до 3,
  "explanation": "короткое объяснение"
}`;
  } else {
    userPrompt = `Сгенерируй ровно ОДИН вопрос викторины строго по теме "${topic}".
Нельзя отклоняться от темы.
Средняя сложность.

Формат строго JSON:
{
  "question": "текст вопроса",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctIndex": число от 0 до 3,
  "explanation": "короткое объяснение"
}`;
  }

  try {
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

    console.log("[AI] Реальная модель:", data.model || "не указано в ответе");

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
  res.sendStatus(200);

  const update = req.body;

  if (!update?.message?.text?.startsWith("/quiz")) {
    return;
  }

  const chatId = update.message.chat.id;
  const text = update.message.text.trim();
  const topic = text.slice(5).trim();

  try {
    const loadingMsg = await bot.sendMessage(chatId, "Генерирую вопрос... ⏳");

    const quiz = await generateQuiz(topic);

    await bot.sendPoll(chatId, quiz.question, quiz.options, {
      type: "quiz",
      correct_option_id: quiz.correctIndex,
      explanation: quiz.explanation,
      is_anonymous: false,
      protects_content: false,
    });

    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
  } catch (err) {
    console.error("[Webhook] Ошибка:", err.message);
    bot
      .sendMessage(chatId, "Не удалось создать вопрос 😔\nПопробуй позже.")
      .catch(() => {});
  }
});

// ──────────────────────────────────────────────
//           Health-check для Render
// ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Бот работает (webhook-режим)");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "жив",
    uptime: Math.floor(process.uptime() / 60) + " минут",
  });
});

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

// Heartbeat, чтобы Render видел активность
setInterval(() => {
  console.log(
    `Сердцебиение: бот жив | uptime ${Math.floor(process.uptime() / 60)} мин`
  );
}, 55000);
