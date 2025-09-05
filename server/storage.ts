import { type AdminUser, type InsertAdminUser, type Game, type InsertGame, type Session, type InsertSession, type Participant, type InsertParticipant, type Submission, type InsertSubmission, type SessionPoints, type GameWithLeaderboard, type SessionResults } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { adminUsers, games, sessions, participants, submissions, sessionPoints } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Games
  getGame(id: string): Promise<Game | undefined>;
  getGameByCode(code: string): Promise<Game | undefined>;
  getAllGames(): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;
  getGameWithLeaderboard(id: string): Promise<GameWithLeaderboard | undefined>;
  
  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getSessionsByGameId(gameId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined>;
  updateSessionStatus(id: string, status: "draft" | "live" | "closed" | "canceled", timestamps?: { startedAt?: Date; endsAt?: Date; endedAt?: Date }): Promise<Session | undefined>;
  
  // Participants
  getParticipant(id: string): Promise<Participant | undefined>;
  getParticipantsByGameId(gameId: string): Promise<Participant[]>;
  getParticipantByGameAndName(gameId: string, displayName: string): Promise<Participant | undefined>;
  createParticipant(participant: InsertParticipant): Promise<Participant>;
  
  // Submissions
  getSubmission(sessionId: string, participantId: string): Promise<Submission | undefined>;
  getSubmissionsBySessionId(sessionId: string): Promise<Submission[]>;
  upsertSubmission(submission: InsertSubmission): Promise<Submission>;
  
  // Session Points
  getSessionPointsBySessionId(sessionId: string): Promise<SessionPoints[]>;
  upsertSessionPoints(sessionId: string, participantId: string, points: number): Promise<SessionPoints>;
  
  // Complex operations
  calculateAndStoreSessionResults(sessionId: string): Promise<SessionResults>;
  getParticipantLeaderboardForGame(gameId: string): Promise<Array<{ participantId: string; displayName: string; totalPoints: number; sessionsPlayed: number }>>;
}

export class MemStorage implements IStorage {
  private games: Map<string, Game> = new Map();
  private sessions: Map<string, Session> = new Map();
  private participants: Map<string, Participant> = new Map();
  private submissions: Map<string, Submission> = new Map();
  private sessionPoints: Map<string, SessionPoints> = new Map();
  private gameCodeMap: Map<string, string> = new Map(); // code -> gameId

  // Helper to generate unique 6-digit codes
  private generateGameCode(): string {
    let code: string;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (this.gameCodeMap.has(code));
    return code;
  }

  // Admin user methods removed - now using Google OAuth

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async getGameByCode(code: string): Promise<Game | undefined> {
    const gameId = this.gameCodeMap.get(code);
    return gameId ? this.games.get(gameId) : undefined;
  }

  async getAllGames(): Promise<Game[]> {
    return Array.from(this.games.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const code = this.generateGameCode();
    const game: Game = { 
      ...insertGame, 
      id, 
      code,
      status: insertGame.status || "active",
      createdAt: new Date() 
    };
    this.games.set(id, game);
    this.gameCodeMap.set(code, id);
    return game;
  }

  async getGameWithLeaderboard(id: string): Promise<GameWithLeaderboard | undefined> {
    const game = await this.getGame(id);
    if (!game) return undefined;
    
    const leaderboard = await this.getParticipantLeaderboardForGame(id);
    return { ...game, leaderboard };
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getSessionsByGameId(gameId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(session => session.gameId === gameId);
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = { 
      ...insertSession, 
      id, 
      status: insertSession.status || "draft",
      startedAt: null,
      endsAt: null,
      endedAt: null,
      resultsCalculated: false,
      createdAt: new Date() 
    };
    this.sessions.set(id, session);
    return session;
  }

  async updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  async updateSessionStatus(id: string, status: "draft" | "live" | "closed" | "canceled", timestamps?: { startedAt?: Date; endsAt?: Date; endedAt?: Date }): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const updatedSession: Session = { 
      ...session, 
      status,
      ...(timestamps?.startedAt && { startedAt: timestamps.startedAt }),
      ...(timestamps?.endsAt && { endsAt: timestamps.endsAt }),
      ...(timestamps?.endedAt && { endedAt: timestamps.endedAt }),
    };
    
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  async getParticipant(id: string): Promise<Participant | undefined> {
    return this.participants.get(id);
  }

  async getParticipantsByGameId(gameId: string): Promise<Participant[]> {
    return Array.from(this.participants.values()).filter(participant => participant.gameId === gameId);
  }

  async getParticipantByGameAndName(gameId: string, displayName: string): Promise<Participant | undefined> {
    return Array.from(this.participants.values()).find(
      participant => participant.gameId === gameId && participant.displayName === displayName
    );
  }

  async createParticipant(insertParticipant: InsertParticipant): Promise<Participant> {
    const id = randomUUID();
    const participant: Participant = { 
      ...insertParticipant, 
      id, 
      ownerAdminUserId: insertParticipant.ownerAdminUserId || null,
      createdAt: new Date() 
    };
    this.participants.set(id, participant);
    return participant;
  }

  async getSubmission(sessionId: string, participantId: string): Promise<Submission | undefined> {
    return Array.from(this.submissions.values()).find(
      submission => submission.sessionId === sessionId && submission.participantId === participantId
    );
  }

  async getSubmissionsBySessionId(sessionId: string): Promise<Submission[]> {
    return Array.from(this.submissions.values()).filter(submission => submission.sessionId === sessionId);
  }

  async upsertSubmission(insertSubmission: InsertSubmission): Promise<Submission> {
    const existing = await this.getSubmission(insertSubmission.sessionId, insertSubmission.participantId);
    
    if (existing) {
      const updated: Submission = {
        ...existing,
        ...insertSubmission,
        submittedAt: new Date()
      };
      this.submissions.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const submission: Submission = {
        ...insertSubmission,
        id,
        vote: insertSubmission.vote || null,
        guessYesCount: insertSubmission.guessYesCount || null,
        submittedAt: new Date()
      };
      this.submissions.set(id, submission);
      return submission;
    }
  }

  async getSessionPointsBySessionId(sessionId: string): Promise<SessionPoints[]> {
    return Array.from(this.sessionPoints.values()).filter(points => points.sessionId === sessionId);
  }

  async upsertSessionPoints(sessionId: string, participantId: string, points: number): Promise<SessionPoints> {
    const existing = Array.from(this.sessionPoints.values()).find(
      sp => sp.sessionId === sessionId && sp.participantId === participantId
    );
    
    if (existing) {
      const updated: SessionPoints = { ...existing, points };
      this.sessionPoints.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const sessionPoint: SessionPoints = { id, sessionId, participantId, points };
      this.sessionPoints.set(id, sessionPoint);
      return sessionPoint;
    }
  }

  async calculateAndStoreSessionResults(sessionId: string): Promise<SessionResults> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    const submissions = await this.getSubmissionsBySessionId(sessionId);
    const votingSubmissions = submissions.filter(s => s.vote !== null);
    
    const yesCount = votingSubmissions.filter(s => s.vote === "YES").length;
    const noCount = votingSubmissions.filter(s => s.vote === "NO").length;

    const results: SessionResults = {
      sessionId,
      question: session.question,
      yesCount,
      noCount,
      participants: [],
      leaderboardDelta: []
    };

    for (const submission of submissions) {
      const participant = await this.getParticipant(submission.participantId);
      if (!participant) continue;

      let points = 0;
      if (submission.vote && submission.guessYesCount !== null && submission.guessYesCount !== undefined) {
        const error = Math.abs(submission.guessYesCount - yesCount);
        if (error === 0) points = 5;
        else if (error === 1) points = 3;
      }

      // Store points (always record participation, even if 0 points)
      await this.upsertSessionPoints(sessionId, submission.participantId, points);

      results.participants.push({
        participantId: submission.participantId,
        displayName: participant.displayName,
        vote: submission.vote,
        guess: submission.guessYesCount,
        points
      });

      results.leaderboardDelta.push({
        participantId: submission.participantId,
        deltaPoints: points
      });
    }

    return results;
  }

  async getParticipantLeaderboardForGame(gameId: string): Promise<Array<{ participantId: string; displayName: string; totalPoints: number; sessionsPlayed: number }>> {
    const participants = await this.getParticipantsByGameId(gameId);
    const sessions = await this.getSessionsByGameId(gameId);
    const closedSessions = sessions.filter(s => s.status === "closed");

    const leaderboard = participants.map(participant => {
      let totalPoints = 0;
      let sessionsPlayed = 0;

      for (const session of closedSessions) {
        const points = Array.from(this.sessionPoints.values()).find(
          sp => sp.sessionId === session.id && sp.participantId === participant.id
        );
        if (points) {
          totalPoints += points.points;
          sessionsPlayed++;
        }
      }

      return {
        participantId: participant.id,
        displayName: participant.displayName,
        totalPoints,
        sessionsPlayed
      };
    });

    return leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
  }
}

export class DatabaseStorage implements IStorage {
  private generateGameCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Admin Users
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return user || undefined;
  }

  async createAdminUser(insertUser: InsertAdminUser): Promise<AdminUser> {
    const [user] = await db
      .insert(adminUsers)
      .values(insertUser)
      .returning();
    return user;
  }

  // Games
  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game || undefined;
  }

  async getGameByCode(code: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.code, code));
    return game || undefined;
  }

  async getAllGames(): Promise<Game[]> {
    return await db.select().from(games).orderBy(desc(games.createdAt));
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    let code: string;
    let attempts = 0;
    do {
      code = this.generateGameCode();
      attempts++;
      const existing = await this.getGameByCode(code);
      if (!existing) break;
    } while (attempts < 10);

    const [game] = await db
      .insert(games)
      .values({ ...insertGame, code })
      .returning();
    return game;
  }

  async getGameWithLeaderboard(id: string): Promise<GameWithLeaderboard | undefined> {
    const game = await this.getGame(id);
    if (!game) return undefined;

    const leaderboard = await this.getParticipantLeaderboardForGame(id);
    return { ...game, leaderboard };
  }

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionsByGameId(gameId: string): Promise<Session[]> {
    return await db.select().from(sessions).where(eq(sessions.gameId, gameId)).orderBy(desc(sessions.createdAt));
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const [session] = await db
      .insert(sessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined> {
    const [session] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async updateSessionStatus(
    id: string, 
    status: "draft" | "live" | "closed" | "canceled",
    timestamps?: { startedAt?: Date; endsAt?: Date; endedAt?: Date }
  ): Promise<Session | undefined> {
    const updateData: any = { status };
    if (timestamps?.startedAt) updateData.startedAt = timestamps.startedAt;
    if (timestamps?.endsAt) updateData.endsAt = timestamps.endsAt;
    if (timestamps?.endedAt) updateData.endedAt = timestamps.endedAt;

    const [session] = await db
      .update(sessions)
      .set(updateData)
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  // Participants
  async getParticipant(id: string): Promise<Participant | undefined> {
    const [participant] = await db.select().from(participants).where(eq(participants.id, id));
    return participant || undefined;
  }

  async getParticipantsByGameId(gameId: string): Promise<Participant[]> {
    return await db.select().from(participants).where(eq(participants.gameId, gameId));
  }

  async getParticipantByGameAndName(gameId: string, displayName: string): Promise<Participant | undefined> {
    const [participant] = await db
      .select()
      .from(participants)
      .where(sql`${participants.gameId} = ${gameId} AND ${participants.displayName} = ${displayName}`);
    return participant || undefined;
  }

  async createParticipant(insertParticipant: InsertParticipant): Promise<Participant> {
    const [participant] = await db
      .insert(participants)
      .values(insertParticipant)
      .returning();
    return participant;
  }

  // Submissions
  async getSubmission(sessionId: string, participantId: string): Promise<Submission | undefined> {
    const [submission] = await db
      .select()
      .from(submissions)
      .where(sql`${submissions.sessionId} = ${sessionId} AND ${submissions.participantId} = ${participantId}`);
    return submission || undefined;
  }

  async getSubmissionsBySessionId(sessionId: string): Promise<Submission[]> {
    return await db.select().from(submissions).where(eq(submissions.sessionId, sessionId));
  }

  async upsertSubmission(insertSubmission: InsertSubmission): Promise<Submission> {
    // Check if submission exists
    const existing = await this.getSubmission(insertSubmission.sessionId, insertSubmission.participantId);
    
    if (existing) {
      const [submission] = await db
        .update(submissions)
        .set(insertSubmission)
        .where(sql`${submissions.sessionId} = ${insertSubmission.sessionId} AND ${submissions.participantId} = ${insertSubmission.participantId}`)
        .returning();
      return submission;
    } else {
      const [submission] = await db
        .insert(submissions)
        .values(insertSubmission)
        .returning();
      return submission;
    }
  }

  // Session Points
  async getSessionPointsBySessionId(sessionId: string): Promise<SessionPoints[]> {
    return await db.select().from(sessionPoints).where(eq(sessionPoints.sessionId, sessionId));
  }

  async upsertSessionPoints(sessionId: string, participantId: string, points: number): Promise<SessionPoints> {
    // Check if points exist
    const [existing] = await db
      .select()
      .from(sessionPoints)
      .where(sql`${sessionPoints.sessionId} = ${sessionId} AND ${sessionPoints.participantId} = ${participantId}`);
    
    if (existing) {
      const [updated] = await db
        .update(sessionPoints)
        .set({ points })
        .where(sql`${sessionPoints.sessionId} = ${sessionId} AND ${sessionPoints.participantId} = ${participantId}`)
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(sessionPoints)
        .values({ sessionId, participantId, points })
        .returning();
      return created;
    }
  }

  private async upsertSessionPointsInTransaction(tx: any, sessionId: string, participantId: string, points: number): Promise<SessionPoints> {
    // Check if points exist within transaction
    const [existing] = await tx
      .select()
      .from(sessionPoints)
      .where(sql`${sessionPoints.sessionId} = ${sessionId} AND ${sessionPoints.participantId} = ${participantId}`);
    
    if (existing) {
      const [updated] = await tx
        .update(sessionPoints)
        .set({ points })
        .where(sql`${sessionPoints.sessionId} = ${sessionId} AND ${sessionPoints.participantId} = ${participantId}`)
        .returning();
      return updated;
    } else {
      const [created] = await tx
        .insert(sessionPoints)
        .values({ sessionId, participantId, points })
        .returning();
      return created;
    }
  }

  // Complex operations
  async calculateAndStoreSessionResults(sessionId: string): Promise<SessionResults> {
    // Check if results are already calculated
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    if (session.resultsCalculated) {
      // Results already calculated, just return them from stored data
      return await this.getStoredSessionResults(sessionId);
    }

    // Use transaction to ensure all session points are stored atomically
    return await db.transaction(async (tx) => {
      const sessionSubmissions = await this.getSubmissionsBySessionId(sessionId);
      const yesVotes = sessionSubmissions.filter(s => s.vote === 'YES').length;
      const noVotes = sessionSubmissions.filter(s => s.vote === 'NO').length;
      
      const participants = [];
      const leaderboardDelta = [];

      for (const submission of sessionSubmissions) {
        const participant = await this.getParticipant(submission.participantId);
        if (!participant) continue;

        const points = this.calculatePoints(submission.guessYesCount, yesVotes);
        
        // Store points within transaction (always record participation, even if 0 points)
        await this.upsertSessionPointsInTransaction(tx, sessionId, submission.participantId, points);

        participants.push({
          participantId: submission.participantId,
          displayName: participant.displayName,
          vote: submission.vote,
          guess: submission.guessYesCount,
          points
        });

        leaderboardDelta.push({
          participantId: submission.participantId,
          deltaPoints: points
        });
      }

      // Mark results as calculated
      await tx.update(sessions).set({ resultsCalculated: true }).where(eq(sessions.id, sessionId));

      const results: SessionResults = {
        sessionId: session.id,
        question: session.question,
        yesCount: yesVotes,
        noCount: noVotes,
        participants,
        leaderboardDelta
      };

      return results;
    });
  }

  private async getStoredSessionResults(sessionId: string): Promise<SessionResults> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const sessionSubmissions = await this.getSubmissionsBySessionId(sessionId);
    const storedPoints = await this.getSessionPointsBySessionId(sessionId);
    const yesVotes = sessionSubmissions.filter(s => s.vote === 'YES').length;
    const noVotes = sessionSubmissions.filter(s => s.vote === 'NO').length;
    
    const participants = [];
    const leaderboardDelta = [];

    for (const submission of sessionSubmissions) {
      const participant = await this.getParticipant(submission.participantId);
      if (!participant) continue;

      const pointsRecord = storedPoints.find(p => p.participantId === submission.participantId);
      const points = pointsRecord?.points || 0;

      participants.push({
        participantId: submission.participantId,
        displayName: participant.displayName,
        vote: submission.vote,
        guess: submission.guessYesCount,
        points
      });

      leaderboardDelta.push({
        participantId: submission.participantId,
        deltaPoints: points
      });
    }

    return {
      sessionId: session.id,
      question: session.question,
      yesCount: yesVotes,
      noCount: noVotes,
      participants,
      leaderboardDelta
    };
  }

  private calculatePoints(guess: number | null, actualYesCount: number): number {
    if (guess === null) return 0;
    if (guess === actualYesCount) return 5; // Exact match
    if (Math.abs(guess - actualYesCount) === 1) return 3; // Within 1
    return 0;
  }

  async getParticipantLeaderboardForGame(gameId: string): Promise<Array<{ participantId: string; displayName: string; totalPoints: number; sessionsPlayed: number }>> {
    const result = await db
      .select({
        participantId: participants.id,
        displayName: participants.displayName,
        totalPoints: sql<number>`COALESCE(SUM(${sessionPoints.points}), 0)`,
        sessionsPlayed: sql<number>`COUNT(DISTINCT ${sessionPoints.sessionId})`
      })
      .from(participants)
      .leftJoin(sessionPoints, eq(participants.id, sessionPoints.participantId))
      .where(eq(participants.gameId, gameId))
      .groupBy(participants.id, participants.displayName)
      .orderBy(desc(sql`COALESCE(SUM(${sessionPoints.points}), 0)`));

    return result.map(r => ({
      participantId: r.participantId,
      displayName: r.displayName,
      totalPoints: Number(r.totalPoints),
      sessionsPlayed: Number(r.sessionsPlayed)
    }));
  }
}

export const storage = new DatabaseStorage();
