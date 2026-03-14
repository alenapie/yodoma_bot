const { generateQuiz } = require("../services/aiService");

function registerQuizHandler(bot) {
  bot.command("quiz", async (ctx) => {
    const topic = ctx.message.text.slice("/quiz".length).trim();

    try {
      const loading = await ctx.reply("Генерирую вопрос... ⏳");
      const quiz = await generateQuiz(topic);

      await ctx.replyWithPoll(quiz.question, quiz.options, {
        type: "quiz",
        correct_option_id: quiz.correctIndex,
        explanation: quiz.explanation,
        is_anonymous: false,
      });

      await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
    } catch (err) {
      console.error("Ошибка /quiz:", err.message);
      await ctx.reply("Не удалось создать вопрос 😔");
    }
  });
}

module.exports = {
  registerQuizHandler,
};
