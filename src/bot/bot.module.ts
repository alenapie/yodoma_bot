import { Module } from "@nestjs/common";
import { BotService } from "./bot.service";
import { Pool } from "pg";

@Module({
  providers: [
    BotService,
    {
      provide: "PG_POOL",
      useFactory: async () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        // Создаём таблицу participants при старте
        await pool.query(`
          CREATE TABLE IF NOT EXISTS participants (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT
          );
        `);
        return pool;
      },
    },
  ],
  exports: [BotService],
})
export class BotModule {}
