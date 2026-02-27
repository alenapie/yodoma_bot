require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateQuiz() {
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

  return JSON.parse(response.choices[0].message.content);
}

bot.onText(/\/quiz/, async (msg) => {
  const chatId = msg.chat.id;

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
});
