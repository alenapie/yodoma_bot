import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { BotService } from "./bot.service";
import { BotController } from "./bot.controller";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [HttpModule, DatabaseModule],
  providers: [BotService],
  controllers: [BotController],
})
export class BotModule {}
