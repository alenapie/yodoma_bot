require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch"); // Для обычных HTTP-запросов

// Переменные окружения
const TOKEN = process.env.TELEGRAM_TOKEN;
const APP_URL = process.env.APP_URL;
const AI_KEY = process.env.AI_MEDIATOR_KEY; // твой ключ с app.ai-mediator.ru

if (!TOKEN || !APP_URL || !AI_KEY) {
  console.error(
    "Не заданы переменные окружения: TELEGRAM_TOKEN, AI_MEDIATOR_KEY или APP_URL"
  );
  process.exit(1);
}

// Настройка Express
const app = express();
app.use(express.json());

// Инициализация бота без polling
const bot = new TelegramBot(TOKEN);

// Функция генерации викторины через AI Mediator
async function generateQuiz() {
  const response = await fetch(
    "https://app.ai-mediator.ru/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // или модель, которая доступна в твоем тарифе
        messages: [
          {
            role: "system",
            content:
              "Ты создаешь викторины. Отвечай строго JSON без лишнего текста.",
          },
          {
            role: "user",
            content: `
Сгенерируй 1 вопрос викторины средней сложности.
Формат:
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

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

// Webhook endpoint для Telegram
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
      });
    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, "Ошибка генерации вопроса 😢");
    }
  }

  res.sendStatus(200);
});

// Установка Webhook
bot.setWebHook(`${APP_URL}/bot${TOKEN}`);

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
