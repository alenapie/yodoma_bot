require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

// Переменные окружения
const TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const APP_URL = process.env.APP_URL;

if (!TOKEN || !OPENAI_KEY || !APP_URL) {
  console.error(
    "Не заданы переменные окружения: TELEGRAM_TOKEN, OPENAI_API_KEY или APP_URL"
  );
  process.exit(1);
}

// Клиент OpenAI
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Настройка Express
const app = express();
app.use(express.json());

// Инициализация бота без polling
const bot = new TelegramBot(TOKEN);

// Webhook endpoint для Telegram
app.post(`/bot${TOKEN}`, async (req, res) => {
  const update = req.body;

  // Обработка команды /quiz
  if (update.message && update.message.text === "/quiz") {
    const chatId = update.message.chat.id;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
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
      });

      const quiz = JSON.parse(response.choices[0].message.content);

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
