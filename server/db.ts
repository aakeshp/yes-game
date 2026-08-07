import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Same dev/prod split as the Google OAuth config in server/index.ts
const isProduction = process.env.NODE_ENV === 'production';
export const databaseUrl = isProduction
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  const varName = isProduction ? 'DATABASE_URL_PROD' : 'DATABASE_URL';
  throw new Error(
    `${varName} must be set. Did you forget to provision a database?`,
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_admins (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id varchar NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      email text NOT NULL,
      invited_by_email text,
      created_at timestamp DEFAULT NOW(),
      UNIQUE(game_id, email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id text NOT NULL UNIQUE,
      email text NOT NULL,
      display_name text NOT NULL,
      created_at timestamp DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE participants ADD COLUMN IF NOT EXISTS player_user_id varchar REFERENCES player_users(id)
  `);
}
