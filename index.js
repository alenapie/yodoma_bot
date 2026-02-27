require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// =====================
// Переменные окружения
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const AI_MEDIATOR_KEY = process.env.AI_MEDIATOR_API_KEY;
const APP_URL = process.env.APP_URL;

if (!TOKEN || !AI_MEDIATOR_KEY || !APP_URL) {
  console.error("❌ Не заданы TELEGRAM_TOKEN, AI_MEDIATOR_API_KEY или APP_URL");
  process.exit(1);
}

// =====================
// Express
// =====================
const app = express();
app.use(express.json());

// =====================
// Telegram bot (без polling)
// =====================
const bot = new TelegramBot(TOKEN);

// =====================
// Генерация викторины
// =====================
async function generateQuiz() {
  const response = await fetch(
    "https://api.ai-mediator.ru/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_MEDIATOR_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "Ты создаешь викторины. Отвечай строго валидным JSON без лишнего текста.",
          },
          {
            role: "user",
            content: `
Сгенерируй 1 вопрос викторины средней сложности.

Формат строго:
{
  "question": "текст вопроса",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 1,
  "explanation": "пояснение"
}
`,
          },
        ],
      }),
    }
  );

  // 🔴 Проверка HTTP ошибки
  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ AI Mediator HTTP Error:", errorText);
    throw new Error("Ошибка ответа AI Mediator");
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    console.error("❌ Некорректный ответ:", data);
    throw new Error("AI вернул неожиданный формат");
  }

  const content = data.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("❌ Ошибка парсинга JSON:", content);
    throw new Error("AI вернул невалидный JSON");
  }
}

// =====================
// Webhook endpoint
// =====================
app.post(`/bot${TOKEN}`, async (req, res) => {
  const update = req.body;

  if (update.message && update.message.text === "/quiz") {
    const chatId = update.message.chat.id;

    try {
      const quiz = await generateQuiz();

      await bot.sendPoll(chatId, quiz.question, quiz.options, {
        type: "quiz",
        correct_option_id: quiz.correctIndex,
        explanation: quiz.explanation,
        is_anonymous: false,
      });
    } catch (error) {
      console.error("❌ Ошибка генерации:", error.message);
      await bot.sendMessage(chatId, "Ошибка генерации вопроса 😢");
    }
  }

  res.sendStatus(200);
});

// =====================
// Установка Webhook
// =====================
bot
  .setWebHook(`${APP_URL}/bot${TOKEN}`)
  .then(() => {
    console.log(`✅ Webhook установлен: ${APP_URL}/bot${TOKEN}`);
  })
  .catch((err) => {
    console.error("❌ Ошибка установки webhook:", err.message);
  });

// =====================
// Запуск сервера
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
