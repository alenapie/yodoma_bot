import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { BotModule } from "./bot/bot.module";
import { DatabaseModule } from "./database/database.module";

@Module({
  imports: [HttpModule, DatabaseModule, BotModule],
})
export class AppModule {}
