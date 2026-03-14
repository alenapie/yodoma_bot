const { registerQuizHandler } = require("./registerQuizHandler");
const { registerYodomaHandler } = require("./registerYodomaHandler");
const { registerCustomHandlers } = require("./registerCustomHandlers");

function registerBotHandlers(bot) {
  registerQuizHandler(bot);
  registerYodomaHandler(bot);
  registerCustomHandlers(bot);
}

module.exports = {
  registerBotHandlers,
};
