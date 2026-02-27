require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ──────────────────────────────────────────────
//                Конфигурация
// ──────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_TOKEN;
const AI_MEDIATOR_KEY = process.env.AI_MEDIATOR_API_KEY;
const APP_URL = process.env.APP_URL;

if (!TOKEN || !AI_MEDIATOR_KEY || !APP_URL) {
  console.error(
    "❌ Отсутствует один или несколько обязательных переменных окружения:"
  );
  console.error("   TELEGRAM_TOKEN, AI_MEDIATOR_API_KEY, APP_URL");
  process.exit(1);
}

// ──────────────────────────────────────────────
//                Инициализация
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

const bot = new TelegramBot(TOKEN, { polling: false });

// ──────────────────────────────────────────────
//         Улучшенная генерация вопроса
// ──────────────────────────────────────────────
async function generateQuiz(topic = "") {
  const isRandom = !topic.trim();

  const systemPrompt =
    "Ты генератор вопросов для викторин. Отвечай ТОЛЬКО валидным JSON. Никакого текста вне объекта. Никаких пояснений, приветствий, ```json и т.п.";

  let userPrompt;

  if (isRandom) {
    userPrompt = `Сгенерируй ОДИН случайный вопрос викторины средней сложности.
Важно: максимально разнообразная тема — НЕ химия, НЕ математика, НЕ физика, НЕ программирование по умолчанию.
Старайся выбирать интересные, необычные темы из разных областей знаний.

Формат ответа — строго JSON:
{
  "question": "текст вопроса",
  "options": ["вариант А", "вариант Б", "вариант В", "вариант Г"],
  "correctIndex": 0,
  "explanation": "короткое объяснение, почему этот ответ правильный"
}`;
  } else {
    userPrompt = `Сгенерируй ОДИН вопрос викторины СТРОГО по теме: "${topic}".
Никаких отклонений от указанной темы!
Средний уровень сложности.

Формат ответа — строго JSON:
{
  "question": "текст вопроса",
  "options": ["вариант А", "вариант Б", "вариант В", "вариант Г"],
  "correctIndex": 0,
  "explanation": "короткое объяснение, почему этот ответ правильный"
}`;
  }

  try {
    const response = await fetch(
      "https://api.ai-mediator.ru/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_MEDIATOR_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // можно попробовать "gpt-4o" или "claude-3-5-sonnet"
          temperature: 0.75,
          max_tokens: 600,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API ошибка ${response.status}: ${errText}`);
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      throw new Error("AI вернул неожиданный формат ответа");
    }

    const rawContent = data.choices[0].message.content.trim();

    // Убираем возможные обёртки ```json ... ```
    const cleaned = rawContent
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    const quiz = JSON.parse(cleaned);

    // Проверяем обязательные поля
    if (
      typeof quiz.question !== "string" ||
      !Array.isArray(quiz.options) ||
      quiz.options.length !== 4 ||
      !Number.isInteger(quiz.correctIndex) ||
      quiz.correctIndex < 0 ||
      quiz.correctIndex > 3 ||
      typeof quiz.explanation !== "string"
    ) {
      throw new Error("AI вернул некорректную структуру вопроса");
    }

    return quiz;
  } catch (err) {
    console.error("Ошибка генерации вопроса:", err.message);
    throw err;
  }
}

// ──────────────────────────────────────────────
//               Webhook Telegram
// ──────────────────────────────────────────────
app.post(`/bot${TOKEN}`, async (req, res) => {
  try {
    const update = req.body;

    if (!update?.message?.text?.startsWith("/quiz")) {
      return res.sendStatus(200);
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const topic = text.slice(5).trim(); // всё после /quiz

    const loadingMsg = await bot.sendMessage(chatId, "Генерирую вопрос... ⏳");

    const quiz = await generateQuiz(topic);

    await bot.sendPoll(chatId, quiz.question, quiz.options, {
      type: "quiz",
      correct_option_id: quiz.correctIndex, // важно: с 0!
      explanation: quiz.explanation,
      is_anonymous: false,
      protects_content: false,
    });

    // удаляем сообщение «Генерирую...»
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
  } catch (err) {
    console.error("Ошибка в обработке /quiz:", err);

    const chatId = req.body?.message?.chat?.id;
    if (chatId) {
      await bot
        .sendMessage(
          chatId,
          "Не удалось сгенерировать вопрос 😔\nПопробуй позже."
        )
        .catch(() => {});
    }
  }

  res.sendStatus(200);
});

// ──────────────────────────────────────────────
//               Установка Webhook
// ──────────────────────────────────────────────
async function setupWebhook() {
  const webhookUrl = `${APP_URL}/bot${TOKEN}`;

  try {
    await bot.setWebHook(webhookUrl);
    console.log(`Webhook успешно установлен → ${webhookUrl}`);
  } catch (err) {
    console.error("Ошибка установки webhook:", err.message);
  }
}

setupWebhook();

// ──────────────────────────────────────────────
//                   Запуск сервера
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
