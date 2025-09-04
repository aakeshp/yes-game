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
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
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
        console.log('WebSocket message received:', data);
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
      
      console.log(`Session join attempt: sessionId=${sessionId}, participantId=${participantId}, displayName=${displayName}`);

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

      console.log(`Participant check: participantId=${participant.id}, hasExistingSubmission=${isExistingParticipant}`);

      // Apply 10-second join cutoff only to NEW participants, not existing ones
      if (session.status === 'live' && session.endsAt && !isExistingParticipant) {
        const timeRemaining = session.endsAt.getTime() - Date.now();
        console.log(`New participant join check: timeRemaining=${timeRemaining}ms`);
        if (timeRemaining < 10000) { // 10 seconds
          console.log('Blocking new participant - less than 10 seconds remaining');
          ws.send(JSON.stringify({ type: 'error', message: 'Joining closed - less than 10 seconds remaining' }));
          return;
        }
      } else if (isExistingParticipant) {
        console.log('Allowing existing participant to rejoin/reconnect');
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
        console.log('Submit failed: not connected to session');
        ws.send(JSON.stringify({ type: 'error', message: 'Not connected to a session' }));
        return;
      }
      
      console.log(`Vote submit attempt: sessionId=${connection.sessionId}, participantId=${connection.participantId}, vote=${payload.vote}, guess=${payload.guessYesCount}`);

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

  app.post('/api/sessions/:sessionId/restart', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const submissions = await storage.getSubmissionsBySessionId(req.params.sessionId);
      if (submissions.length > 0) {
        res.status(400).json({ error: 'Cannot restart session with existing submissions' });
        return;
      }

      const newSession = await storage.createSession({
        gameId: session.gameId,
        question: session.question,
        timerSeconds: session.timerSeconds
      });

      res.json({ sessionId: newSession.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to restart session' });
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
