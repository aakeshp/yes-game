import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertGameSchema, insertSessionSchema, insertParticipantSchema, insertSubmissionSchema } from "@shared/schema";
import { z } from "zod";

interface WebSocketConnection {
  ws: WebSocket;
  sessionId?: string;
  participantId?: string;
  isAdmin?: boolean;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/game-ws' });
  
  const connections = new Map<WebSocket, WebSocketConnection>();
  const sessionRooms = new Map<string, Set<WebSocket>>();

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    connections.set(ws, { ws });
    console.log('New WebSocket connection');

    // Send connection confirmation
    ws.send(JSON.stringify({ type: 'connection:ready' }));

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        // console.log('WebSocket message received:', data);
        await handleWebSocketMessage(ws, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      const connection = connections.get(ws);
      if (connection?.sessionId) {
        const room = sessionRooms.get(connection.sessionId);
        room?.delete(ws);
      }
      connections.delete(ws);
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Keep connection alive with ping/pong
    ws.on('pong', () => {
      // Connection is alive
    });
  });

  async function handleWebSocketMessage(ws: WebSocket, data: any) {
    const connection = connections.get(ws);
    if (!connection) return;

    switch (data.type) {
      case 'session:join':
        await handleSessionJoin(ws, data.payload);
        break;
      case 'session:submit':
        await handleSessionSubmit(ws, data.payload);
        break;
      case 'admin:join':
        await handleAdminJoin(ws, data.payload);
        break;
    }
  }

  async function handleSessionJoin(ws: WebSocket, payload: any) {
    try {
      const { sessionId, participantId, displayName } = payload;
      const connection = connections.get(ws);
      if (!connection) return;
      
      // console.log(`Session join attempt: sessionId=${sessionId}, participantId=${participantId}, displayName=${displayName}`);

      const session = await storage.getSession(sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }

      let participant;
      if (participantId) {
        participant = await storage.getParticipant(participantId);
      } else if (displayName) {
        participant = await storage.getParticipantByGameAndName(session.gameId, displayName);
        if (!participant) {
          participant = await storage.createParticipant({
            gameId: session.gameId,
            displayName,
            ownerAdminUserId: null
          });
        }
      }

      if (!participant) {
        ws.send(JSON.stringify({ type: 'error', message: 'Unable to create or find participant' }));
        return;
      }

      // Check if this is an existing participant with a submission
      const existingSubmission = await storage.getSubmission(sessionId, participant.id);
      const isExistingParticipant = !!existingSubmission;

      // Apply 10-second join cutoff only to NEW participants, not existing ones
      if (session.status === 'live' && session.endsAt && !isExistingParticipant) {
        const timeRemaining = session.endsAt.getTime() - Date.now();
        if (timeRemaining < 10000) { // 10 seconds
          ws.send(JSON.stringify({ type: 'error', message: 'Joining closed - less than 10 seconds remaining' }));
          return;
        }
      }

      // Update connection
      connection.sessionId = sessionId;
      connection.participantId = participant.id;

      // Add to session room
      if (!sessionRooms.has(sessionId)) {
        sessionRooms.set(sessionId, new Set());
      }
      sessionRooms.get(sessionId)!.add(ws);

      // Send join response
      ws.send(JSON.stringify({
        type: 'session:joined',
        payload: {
          sessionId,
          participantId: participant.id,
          participant,
          session,
          currentSubmission: existingSubmission
        }
      }));

      // Broadcast participant count update
      broadcastToSession(sessionId, {
        type: 'session:participant_update',
        payload: {
          participantCount: sessionRooms.get(sessionId)?.size || 0
        }
      });

    } catch (error) {
      console.error('Session join error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to join session' }));
    }
  }

  async function handleSessionSubmit(ws: WebSocket, payload: any) {
    try {
      const connection = connections.get(ws);
      if (!connection?.sessionId || !connection?.participantId) {
        console.log(`Submit failed: not connected to session. Connection state: sessionId=${connection?.sessionId}, participantId=${connection?.participantId}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Not connected to a session' }));
        return;
      }
      
      console.log(`Vote submit: sessionId=${connection.sessionId}, participantId=${connection.participantId}, vote=${payload.vote}, guess=${payload.guessYesCount}`);

      const session = await storage.getSession(connection.sessionId);
      if (!session || session.status !== 'live') {
        ws.send(JSON.stringify({ type: 'error', message: 'Session is not live' }));
        return;
      }

      // Check if session has expired
      if (session.endsAt && Date.now() > session.endsAt.getTime()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session has expired' }));
        return;
      }

      const validatedSubmission = insertSubmissionSchema.parse({
        sessionId: connection.sessionId,
        participantId: connection.participantId,
        vote: payload.vote,
        guessYesCount: payload.guessYesCount
      });

      const submission = await storage.upsertSubmission(validatedSubmission);

      ws.send(JSON.stringify({
        type: 'session:submitted',
        payload: { submission }
      }));

    } catch (error) {
      console.error('Session submit error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to submit' }));
    }
  }

  async function handleAdminJoin(ws: WebSocket, payload: any) {
    const { sessionId } = payload;
    const connection = connections.get(ws);
    if (!connection) return;

    connection.sessionId = sessionId;
    connection.isAdmin = true;

    // Add to session room
    if (!sessionRooms.has(sessionId)) {
      sessionRooms.set(sessionId, new Set());
    }
    sessionRooms.get(sessionId)!.add(ws);

    const session = await storage.getSession(sessionId);
    ws.send(JSON.stringify({
      type: 'admin:joined',
      payload: { session }
    }));
  }

  function broadcastToSession(sessionId: string, message: any, excludeAdmin = false) {
    const room = sessionRooms.get(sessionId);
    if (!room) return;

    room.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        const connection = connections.get(ws);
        if (excludeAdmin && connection?.isAdmin) return;
        ws.send(JSON.stringify(message));
      }
    });
  }

  // Timer management
  const sessionTimers = new Map<string, NodeJS.Timeout>();

  function startSessionTimer(sessionId: string, durationMs: number) {
    const timer = setTimeout(async () => {
      await endSession(sessionId);
    }, durationMs);
    sessionTimers.set(sessionId, timer);

    // Send periodic updates
    const interval = setInterval(() => {
      const session = storage.getSession(sessionId);
      session.then(s => {
        if (s?.status !== 'live') {
          clearInterval(interval);
          return;
        }
        if (s.endsAt) {
          const timeRemaining = Math.max(0, s.endsAt.getTime() - Date.now());
          broadcastToSession(sessionId, {
            type: 'session:tick',
            payload: { timeRemaining: Math.floor(timeRemaining / 1000) }
          });
        }
      });
    }, 1000);
  }

  async function endSession(sessionId: string) {
    try {
      const session = await storage.updateSessionStatus(sessionId, 'closed', { endedAt: new Date() });
      if (!session) return;

      const results = await storage.calculateAndStoreSessionResults(sessionId);
      
      broadcastToSession(sessionId, {
        type: 'session:results',
        payload: results
      });

      sessionTimers.delete(sessionId);
    } catch (error) {
      console.error('End session error:', error);
    }
  }

  // REST API Routes

  // Admin Authentication
  app.post('/api/admin/register', async (req, res) => {
    try {
      const adminData = { name: req.body.name, email: req.body.email };
      const admin = await storage.createAdminUser(adminData);
      res.json({ adminId: admin.id, name: admin.name });
    } catch (error) {
      res.status(400).json({ error: 'Invalid admin data' });
    }
  });

  app.post('/api/admin/login', async (req, res) => {
    try {
      // Simple login - in production you'd verify credentials
      const { adminId } = req.body;
      const admin = await storage.getAdminUser(adminId);
      if (!admin) {
        res.status(404).json({ error: 'Admin not found' });
        return;
      }
      res.json({ adminId: admin.id, name: admin.name });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.get('/api/admin/games', async (req, res) => {
    try {
      // In a real app, you'd filter by admin ID
      const games = await storage.getAllGames();
      res.json(games);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // Games
  app.post('/api/games', async (req, res) => {
    try {
      const gameData = insertGameSchema.parse(req.body);
      const game = await storage.createGame(gameData);
      res.json({ gameId: game.id, code: game.code });
    } catch (error) {
      res.status(400).json({ error: 'Invalid game data' });
    }
  });

  app.get('/api/games/:gameId', async (req, res) => {
    try {
      const game = await storage.getGameWithLeaderboard(req.params.gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }
      res.json(game);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch game' });
    }
  });

  // Historical leaderboard - shows cumulative points up to a specific session
  app.get('/api/games/:gameId/historical-leaderboard/:sessionId', async (req, res) => {
    try {
      const { gameId, sessionId } = req.params;
      
      const game = await storage.getGame(gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      const targetSession = await storage.getSession(sessionId);
      if (!targetSession || targetSession.gameId !== gameId) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Get all sessions for this game up to and including the target session
      const allSessions = await storage.getSessionsByGameId(gameId);
      const sessionsUpToTarget = allSessions
        .filter(s => s.status === 'closed')
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        })
        .filter(s => {
          const sessionDate = s.createdAt ? new Date(s.createdAt).getTime() : 0;
          const targetDate = targetSession.createdAt ? new Date(targetSession.createdAt).getTime() : 0;
          return sessionDate <= targetDate;
        });

      // Get all participants for this game
      const participants = await storage.getParticipantsByGameId(gameId);
      
      // Calculate historical leaderboard up to this session
      const historicalLeaderboard = [];
      
      for (const participant of participants) {
        let totalPoints = 0;
        let sessionsPlayed = 0;
        
        // Sum points from sessions up to the target session
        for (const session of sessionsUpToTarget) {
          const sessionPointsRecords = await storage.getSessionPointsBySessionId(session.id);
          const participantPoints = sessionPointsRecords.find(sp => sp.participantId === participant.id);
          
          if (participantPoints) {
            totalPoints += participantPoints.points;
            sessionsPlayed++;
          }
        }
        
        historicalLeaderboard.push({
          participantId: participant.id,
          displayName: participant.displayName,
          totalPoints,
          sessionsPlayed
        });
      }
      
      // Sort by total points descending
      historicalLeaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
      
      res.json({
        ...game,
        leaderboard: historicalLeaderboard
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch historical leaderboard' });
    }
  });

  app.get('/api/admin/games/:gameId/detailed-leaderboard', async (req, res) => {
    try {
      const game = await storage.getGame(req.params.gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      const participants = await storage.getParticipantsByGameId(req.params.gameId);
      const sessions = await storage.getSessionsByGameId(req.params.gameId);
      
      const leaderboard = [];

      for (const participant of participants) {
        const sessionBreakdown = [];
        let totalPoints = 0;
        let sessionsPlayed = 0;

        for (const session of sessions) {
          if (session.status === 'closed') {
            const sessionPointsRecords = await storage.getSessionPointsBySessionId(session.id);
            const participantPoints = sessionPointsRecords.find(sp => sp.participantId === participant.id);
            
            if (participantPoints) {
              sessionBreakdown.push({
                sessionId: session.id,
                question: session.question,
                points: participantPoints.points,
                status: session.status
              });
              totalPoints += participantPoints.points;
              sessionsPlayed++;
            }
          }
        }

        leaderboard.push({
          participantId: participant.id,
          displayName: participant.displayName,
          totalPoints,
          sessionsPlayed,
          sessionBreakdown
        });
      }

      // Sort by total points descending
      leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

      res.json({
        id: game.id,
        name: game.name,
        code: game.code,
        leaderboard
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch detailed leaderboard' });
    }
  });

  app.get('/api/admin/games/:gameId/export', async (req, res) => {
    try {
      const game = await storage.getGame(req.params.gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      const participants = await storage.getParticipantsByGameId(req.params.gameId);
      const sessions = await storage.getSessionsByGameId(req.params.gameId);
      
      // Get all closed sessions and sort by creation date
      const closedSessions = sessions
        .filter(s => s.status === 'closed')
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });
      
      // Generate CSV content organized by session
      const csvRows = [];
      
      // Build dynamic headers with participant names
      const participantNames = participants.map(p => p.displayName).sort();
      const baseHeaders = ['Session Date', 'Session Question', 'Actual Yes Count', 'Total Participants'];
      
      // Add columns for each participant: Vote, Guess, Points
      const participantHeaders: string[] = [];
      participantNames.forEach(name => {
        participantHeaders.push(`${name} Vote`);
        participantHeaders.push(`${name} Guess`);
        participantHeaders.push(`${name} Points`);
      });
      
      csvRows.push([...baseHeaders, ...participantHeaders].join(','));
      
      // Generate rows for each session
      for (const session of closedSessions) {
        const allSubmissions = await storage.getSubmissionsBySessionId(session.id);
        const sessionPointsRecords = await storage.getSessionPointsBySessionId(session.id);
        const actualYesCount = allSubmissions.filter(s => s.vote === 'YES').length;
        
        const sessionDate = session.endedAt 
          ? new Date(session.endedAt).toISOString().split('T')[0]
          : (session.createdAt ? new Date(session.createdAt).toISOString().split('T')[0] : 'Unknown');
          
        const row = [
          sessionDate,
          `"${session.question}"`,
          actualYesCount,
          allSubmissions.length
        ];
        
        // Add data for each participant in consistent order
        participantNames.forEach(participantName => {
          const participant = participants.find(p => p.displayName === participantName);
          if (participant) {
            const submission = allSubmissions.find(s => s.participantId === participant.id);
            const pointsRecord = sessionPointsRecords.find(sp => sp.participantId === participant.id);
            
            row.push(submission?.vote || 'No Vote');
            row.push(submission?.guessYesCount?.toString() || 'No Guess');
            row.push(pointsRecord?.points?.toString() || '0');
          } else {
            row.push('N/A');
            row.push('N/A');
            row.push('0');
          }
        });
        
        csvRows.push(row.join(','));
      }

      const csvContent = csvRows.join('\n');
      const filename = `${game.name.replace(/[^a-zA-Z0-9]/g, '_')}_results_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
      
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: 'Failed to export game results' });
    }
  });

  app.get('/api/games/code/:code', async (req, res) => {
    try {
      const game = await storage.getGameByCode(req.params.code);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }
      res.json(game);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch game' });
    }
  });

  // Sessions
  app.post('/api/games/:gameId/sessions', async (req, res) => {
    try {
      const sessionData = insertSessionSchema.parse({
        ...req.body,
        gameId: req.params.gameId
      });
      const session = await storage.createSession(sessionData);
      res.json({ sessionId: session.id });
    } catch (error) {
      res.status(400).json({ error: 'Invalid session data' });
    }
  });

  app.patch('/api/sessions/:sessionId', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      
      // Only allow editing draft sessions
      if (session.status !== 'draft') {
        res.status(400).json({ error: 'Can only edit draft sessions' });
        return;
      }

      const updateData = insertSessionSchema.partial().parse(req.body);
      const updatedSession = await storage.updateSession(req.params.sessionId, updateData);
      
      if (!updatedSession) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      
      res.json(updatedSession);
    } catch (error) {
      res.status(400).json({ error: 'Invalid session data' });
    }
  });

  app.get('/api/sessions/:sessionId', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.status === 'live') {
        // Return minimal state during live session
        res.json({
          id: session.id,
          status: session.status,
          question: session.question,
          endsAt: session.endsAt
        });
      } else if (session.status === 'closed') {
        const results = await storage.calculateAndStoreSessionResults(session.id);
        res.json({ ...session, results });
      } else {
        res.json(session);
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch session' });
    }
  });

  app.post('/api/sessions/:sessionId/start', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.status !== 'draft') {
        res.status(400).json({ error: 'Cannot start session' });
        return;
      }

      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + (session.timerSeconds * 1000));

      const updatedSession = await storage.updateSessionStatus(
        req.params.sessionId,
        'live',
        { startedAt, endsAt }
      );

      if (updatedSession) {
        startSessionTimer(req.params.sessionId, session.timerSeconds * 1000);
        
        broadcastToSession(req.params.sessionId, {
          type: 'session:started',
          payload: {
            session: updatedSession,
            timeRemaining: session.timerSeconds
          }
        });

        res.json({ startedAt, endsAt });
      } else {
        res.status(500).json({ error: 'Failed to start session' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to start session' });
    }
  });

  app.post('/api/sessions/:sessionId/end', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.status !== 'live') {
        res.status(400).json({ error: 'Can only end live sessions' });
        return;
      }

      // Clear the timer if it exists
      const timer = sessionTimers.get(req.params.sessionId);
      if (timer) {
        clearTimeout(timer);
        sessionTimers.delete(req.params.sessionId);
      }

      // End the session
      await endSession(req.params.sessionId);
      
      res.json({ success: true, message: 'Session ended successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to end session' });
    }
  });


  app.get('/api/games/:gameId/sessions', async (req, res) => {
    try {
      const sessions = await storage.getSessionsByGameId(req.params.gameId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  // Participants
  app.post('/api/participants', async (req, res) => {
    try {
      const participantData = insertParticipantSchema.parse(req.body);
      
      // Check if participant already exists
      const existing = await storage.getParticipantByGameAndName(
        participantData.gameId,
        participantData.displayName
      );
      
      if (existing) {
        res.json(existing);
        return;
      }

      const participant = await storage.createParticipant(participantData);
      res.json(participant);
    } catch (error) {
      res.status(400).json({ error: 'Invalid participant data' });
    }
  });

  return httpServer;
}
