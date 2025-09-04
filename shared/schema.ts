import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  timerSeconds: integer("timer_seconds").notNull(),
  status: text("status", { enum: ["draft", "live", "closed", "canceled"] }).notNull().default("draft"),
  startedAt: timestamp("started_at"),
  endsAt: timestamp("ends_at"),
  endedAt: timestamp("ended_at"),
  resultsCalculated: boolean("results_calculated").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  gameIdIndex: index("idx_sessions_game_id").on(table.gameId),
}));

export const participants = pgTable("participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  ownerAdminUserId: varchar("owner_admin_user_id").references(() => adminUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  gameIdIndex: index("idx_participants_game_id").on(table.gameId),
}));

export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  participantId: varchar("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  vote: text("vote", { enum: ["YES", "NO"] }),
  guessYesCount: integer("guess_yes_count"),
  submittedAt: timestamp("submitted_at").defaultNow(),
}, (table) => ({
  sessionParticipantUnique: unique("unique_session_participant").on(table.sessionId, table.participantId),
}));

export const sessionPoints = pgTable("session_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  participantId: varchar("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
}, (table) => ({
  sessionParticipantUnique: unique("unique_session_points").on(table.sessionId, table.participantId),
}));

// Insert schemas
export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  code: true,
  createdAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  endsAt: true,
  endedAt: true,
}).extend({
  question: z.string().min(1, "Question is required"),
  timerSeconds: z.number().min(10).max(300),
});

export const insertParticipantSchema = createInsertSchema(participants).omit({
  id: true,
  createdAt: true,
}).extend({
  displayName: z.string().min(1, "Display name is required").max(50),
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  submittedAt: true,
}).extend({
  vote: z.enum(["YES", "NO"]).optional(),
  guessYesCount: z.number().min(0).optional(),
});

// Types
export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Participant = typeof participants.$inferSelect;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type SessionPoints = typeof sessionPoints.$inferSelect;

// Additional types for API responses
export type GameWithLeaderboard = Game & {
  leaderboard: Array<{
    participantId: string;
    displayName: string;
    totalPoints: number;
    sessionsPlayed: number;
  }>;
};

export type SessionResults = {
  sessionId: string;
  question: string;
  yesCount: number;
  noCount: number;
  participants: Array<{
    participantId: string;
    displayName: string;
    vote: "YES" | "NO" | null;
    guess: number | null;
    points: number;
  }>;
  leaderboardDelta: Array<{
    participantId: string;
    deltaPoints: number;
  }>;
};
