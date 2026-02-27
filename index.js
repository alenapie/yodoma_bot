require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ──────────────────────────────────────────────
//                Проверка переменных окружения
// ──────────────────────────────────────────────
console.log(
  "TELEGRAM_TOKEN:",
  !!process.env.TELEGRAM_TOKEN ? "есть" : "ОТСУТСТВУЕТ!"
);
console.log(
  "AI_MEDIATOR_API_KEY:",
  !!process.env.AI_MEDIATOR_API_KEY ? "есть" : "ОТСУТСТВУЕТ!"
);
console.log("APP_URL:", process.env.APP_URL || "не задан");

if (
  !process.env.TELEGRAM_TOKEN ||
  !process.env.AI_MEDIATOR_API_KEY ||
  !process.env.APP_URL
) {
  console.error("❌ Критические переменные окружения отсутствуют!");
  process.exit(1);
}

// ──────────────────────────────────────────────
//                Инициализация
// ──────────────────────────────────────────────
const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });

// ──────────────────────────────────────────────
//         Генерация вопроса (Claude-3-7-sonnet)
// ──────────────────────────────────────────────
async function generateQuiz(topic = "") {
  const isRandom = !topic.trim();

  const systemPrompt = `Ты — генератор викторинных вопросов.
ОТВЕЧАЙ ИСКЛЮЧИТЕЛЬНО одним валидным JSON-объектом.
Никакого текста до, после или внутри — только чистый JSON.
Никаких ``json, никаких пояснений, никаких markdown-обёрток.
Нарушение этого правила — критическая ошибка.`;

  let userPrompt;

  if (isRandom) {
    userPrompt = `Сгенерируй ровно ОДИН вопрос викторины средней сложности на **совершенно случайную** тему.

Строго запрещено:
- химия, периодическая таблица, элементы, атомные номера
- физика, формулы, законы
- математика, уравнения, задачи
- программирование, алгоритмы, код

Выбирай темы из этих или похожих: история, география, страны и столицы, животные, растения, еда, кухни мира, спорт, музыка, кино, сериалы, литература, книги, художники, искусство, архитектура, знаменитости, психология, отношения, мода, автомобили, путешествия, традиции, праздники, мифы.

Формат — строго JSON:
{
  "question": "текст вопроса",
  "options": ["A) вариант", "B) вариант", "C) вариант", "D) вариант"],
  "correctIndex": число от 0 до 3,
  "explanation": "короткое объяснение"
}`;
  } else {
    userPrompt = `Сгенерируй ровно ОДИН вопрос викторины **строго по теме** "${topic}".
Нельзя отклоняться от темы.
Средний уровень сложности.

Формат — строго JSON:
{
  "question": "текст вопроса",
  "options": ["A) вариант", "B) вариант", "C) вариант", "D) вариант"],
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
      throw new Error(`AI API ошибка ${response.status}: ${errText}`);
    }

    const data = await response.json();

    console.log("[AI] Реальная модель:", data.model || "не указано");
    console.log("[AI] Полный ответ:", JSON.stringify(data, null, 2)); // раскомментируй для полной отладки

    let content = data.choices?.[0]?.message?.content?.trim() || "";

    // чистим возможные обёртки
    content = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const quiz = JSON.parse(content);

    // проверка структуры
    if (
      typeof quiz.question !== "string" ||
      !Array.isArray(quiz.options) ||
      quiz.options.length !== 4 ||
      !Number.isInteger(quiz.correctIndex) ||
      quiz.correctIndex < 0 ||
      quiz.correctIndex > 3 ||
      typeof quiz.explanation !== "string"
    ) {
      throw new Error("Некорректная структура ответа от AI");
    }

    return quiz;
  } catch (err) {
    console.error("[generateQuiz] Ошибка:", err.message);
    throw err;
  }
}

// ──────────────────────────────────────────────
//               Webhook Telegram
// ──────────────────────────────────────────────
app.post(`/bot${process.env.TELEGRAM_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // сразу отвечаем Telegram

  const update = req.body;

  if (!update?.message?.text?.startsWith("/quiz")) {
    return;
  }

  const chatId = update.message.chat.id;
  const text = update.message.text.trim();
  const topic = text.slice(5).trim();

  try {
    const loading = await bot.sendMessage(chatId, "Генерирую вопрос... ⏳");

    const quiz = await generateQuiz(topic);

    await bot.sendPoll(chatId, quiz.question, quiz.options, {
      type: "quiz",
      correct_option_id: quiz.correctIndex,
      explanation: quiz.explanation,
      is_anonymous: false,
      protects_content: false,
    });

    bot.deleteMessage(chatId, loading.message_id).catch(() => {});
  } catch (err) {
    console.error("[webhook] Ошибка:", err.message);
    bot
      .sendMessage(chatId, "Не получилось сгенерировать вопрос 😔")
      .catch(() => {});
  }
});

// ──────────────────────────────────────────────
//               Установка Webhook
// ──────────────────────────────────────────────
async function setWebhook() {
  const url = `${process.env.APP_URL}/bot${process.env.TELEGRAM_TOKEN}`;
  try {
    await bot.setWebHook(url);
    console.log(`Webhook установлен: ${url}`);
  } catch (err) {
    console.error("Ошибка установки webhook:", err.message);
  }
}

setWebhook();

// ──────────────────────────────────────────────
//                   Запуск сервера
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен на порту ${PORT} (0.0.0.0)`);
});
