import { type AdminUser, type InsertAdminUser, type Game, type InsertGame, type Session, type InsertSession, type Participant, type InsertParticipant, type Submission, type InsertSubmission, type SessionPoints, type GameWithLeaderboard, type SessionResults } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Admin Users
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  createAdminUser(user: InsertAdminUser): Promise<AdminUser>;
  
  // Games
  getGame(id: string): Promise<Game | undefined>;
  getGameByCode(code: string): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  getGameWithLeaderboard(id: string): Promise<GameWithLeaderboard | undefined>;
  
  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getSessionsByGameId(gameId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
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
  private adminUsers: Map<string, AdminUser> = new Map();
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

  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    return this.adminUsers.get(id);
  }

  async createAdminUser(insertUser: InsertAdminUser): Promise<AdminUser> {
    const id = randomUUID();
    const user: AdminUser = { 
      ...insertUser, 
      id, 
      createdAt: new Date() 
    };
    this.adminUsers.set(id, user);
    return user;
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async getGameByCode(code: string): Promise<Game | undefined> {
    const gameId = this.gameCodeMap.get(code);
    return gameId ? this.games.get(gameId) : undefined;
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const code = this.generateGameCode();
    const game: Game = { 
      ...insertGame, 
      id, 
      code,
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
      startedAt: null,
      endsAt: null,
      endedAt: null,
      createdAt: new Date() 
    };
    this.sessions.set(id, session);
    return session;
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

      // Store points
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

export const storage = new MemStorage();
