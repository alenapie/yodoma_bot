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

  const systemPrompt = `Ты — генератор викторинных вопросов.
ОТВЕЧАЙ ИСКЛЮЧИТЕЛЬНО одним валидным JSON-объектом.
Никакого текста до, после или внутри — только чистый JSON.
Нарушение этого правила — критическая ошибка.`;

  let userPrompt;

  if (isRandom) {
    userPrompt = `Сгенерируй ровно ОДИН вопрос викторины средней сложности на **совершенно случайную** тему.

Строго запрещено использовать темы:
- химия, периодическая таблица, химические элементы, атомные номера
- физика, физические законы, формулы
- математика, уравнения, геометрия, задачи
- программирование, код, алгоритмы

Выбирай темы из этих или похожих направлений:
история, география, страны и столицы, животные, растения, еда и кухни мира, спорт, музыка и исполнители, кино и сериалы, литература и писатели, искусство и художники, знаменитости, психология, отношения, мода, автомобили, путешествия, традиции, праздники, мифы и легенды, повседневная жизнь.

Формат ответа — строго JSON, без единого символа вне объекта:
{
  "question": "текст вопроса",
  "options": ["A) вариант", "B) вариант", "C) вариант", "D) вариант"],
  "correctIndex": число от 0 до 3,
  "explanation": "короткое объяснение правильного ответа"
}`;
  } else {
    userPrompt = `Сгенерируй ровно ОДИН вопрос викторины **строго по теме** "${topic}".
Нельзя отклоняться от указанной темы ни на миллиметр.
Если тема не связана с химией/физикой/математикой — их запрещено добавлять.
Средний уровень сложности.

Формат ответа — строго JSON, без единого символа вне объекта:
{
  "question": "текст вопроса",
  "options": ["A) вариант", "B) вариант", "C) вариант", "D) вариант"],
  "correctIndex": число от 0 до 3,
  "explanation": "короткое объяснение правильного ответа"
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
          model: "claude-3-7-sonnet-20250219", // ← сразу эта модель
          temperature: 0.5, // ниже = лучше следует инструкциям
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

    // Для отладки — смотри в консоли, какую модель реально использовали
    console.log(
      "[generateQuiz] Реальная модель:",
      data.model || data.choices?.[0]?.model || "не указано"
    );

    if (!data?.choices?.[0]?.message?.content) {
      throw new Error("AI вернул неожиданный формат ответа");
    }

    let content = data.choices[0].message.content.trim();

    // Убираем любые возможные markdown-обёртки (Claude иногда их добавляет)
    content = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const quiz = JSON.parse(content);

    // Валидация структуры ответа
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
    console.error("[generateQuiz] Ошибка:", err.message);
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
