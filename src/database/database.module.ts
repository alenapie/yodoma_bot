import { Module, Global } from "@nestjs/common";
import { Pool } from "pg";

@Global()
@Module({
  providers: [
    {
      provide: "PG_POOL",
      useFactory: async () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        await pool.query(`
          CREATE TABLE IF NOT EXISTS participants (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT
          );
        `);
        console.log("✅ Таблица participants готова");
        return pool;
      },
    },
  ],
  exports: ["PG_POOL"],
})
export class DatabaseModule {}
