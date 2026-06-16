import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertGameSchema, insertSessionSchema, insertParticipantSchema, insertSubmissionSchema, insertGameAdminSchema, type PlayerUser } from "@shared/schema";
import { z } from "zod";
import passport from "passport";

interface WebSocketConnection {
  ws: WebSocket;
  sessionId?: string;
  participantId?: string;
  isAdmin?: boolean;
  playerUser: PlayerUser | null;
  wsSessionId?: string; // HTTP session ID at WS connect time — used to invalidate on logout
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: '/game-ws' });
  
  const connections = new Map<WebSocket, WebSocketConnection>();
  const sessionRooms = new Map<string, Set<WebSocket>>();
  
  // Get the admin middleware from app.locals
  const requireAdmin = app.locals.requireAdmin;
  const requireFullAdmin = app.locals.requireFullAdmin;

  function makeGameAccessMiddleware(getGameId: (req: any) => string | Promise<string>) {
    return async (req: any, res: any, next: any) => {
      if (!req.user?.isAdmin) {
        return res.status(401).json({ error: 'Admin access required' });
      }
      if (req.user.isFullAdmin) {
        return next();
      }
      try {
        const gameId = await getGameId(req);
        if (!gameId) {
          return res.status(404).json({ error: 'Resource not found' });
        }
        const allowed = await storage.isGameAdmin(gameId, req.user.email);
        if (allowed) return next();
        return res.status(403).json({ error: 'No access to this game' });
      } catch (err) {
        return res.status(500).json({ error: 'Access check failed' });
      }
    };
  }

  // WebSocket connection handler
  wss.on('connection', (ws, req) => {
    // Apply session middleware to read the session from the upgrade request cookie,
    // so we can derive player identity server-side instead of trusting client payloads.
    const sessionMiddleware = app.locals.sessionMiddleware;
    sessionMiddleware(req as any, {} as any, () => {
      const playerUser: PlayerUser | null = (req as any).session?.playerUser ?? null;
      const wsSessionId: string | undefined = (req as any).sessionID;
      connections.set(ws, { ws, playerUser, wsSessionId });

      // Send connection confirmation
      ws.send(JSON.stringify({ type: 'connection:ready' }));

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
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
      const { sessionId, displayName } = payload;
      const connection = connections.get(ws);
      if (!connection) return;

      // Require authenticated player identity derived from server-side session
      if (!connection.playerUser) {
        ws.send(JSON.stringify({ type: 'error', message: 'Sign in with Google is required to join a session.' }));
        return;
      }

      const playerUser = connection.playerUser;

      const session = await storage.getSession(sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
      }

      // Find or create participant linked to this authenticated player
      let participant = await storage.getParticipantByPlayerAndGame(playerUser.id, session.gameId);
      if (!participant) {
        participant = await storage.createParticipant({
          gameId: session.gameId,
          displayName: displayName || playerUser.displayName,
          ownerAdminUserId: null,
          playerUserId: playerUser.id
        });
      } else if (displayName && displayName !== participant.displayName) {
        // Player chose a different display name for this game — honour it
        await storage.updateParticipantDisplayName(participant.id, displayName);
        participant = { ...participant, displayName };
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

      // Reject stale connections where the player has logged out
      if (!connection.playerUser) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required to submit' }));
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

  function broadcastToAll(message: any) {
    connections.forEach((_, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
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

  // Admin Authentication (Google OAuth only)

  // Admin Google OAuth routes
  app.get('/auth/google', (req: any, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🚀 OAuth Request - Starting Google authentication');
    }
    // Clear any stale player auth flag so callback knows this is admin
    delete req.session.pendingPlayerAuth;
    passport.authenticate('google-admin', { 
      scope: ['profile', 'email']
    })(req, res, next);
  });

  // Player Google OAuth — sets a session flag so the shared callback routes correctly
  app.get('/auth/google/player', (req: any, res, next) => {
    req.session.pendingPlayerAuth = true;
    req.session.save(() => {
      passport.authenticate('google-player', {
        scope: ['profile', 'email']
      })(req, res, next);
    });
  });

  // Shared Google OAuth callback — handles both admin and player flows
  app.get('/auth/google/callback', (req: any, res: any, next: any) => {
    const isPlayerFlow = req.session?.pendingPlayerAuth === true;

    if (isPlayerFlow) {
      delete req.session.pendingPlayerAuth;
      passport.authenticate('google-player', (err: any, _user: any) => {
        if (err) {
          console.error('Player OAuth error:', err);
          return res.redirect('/');
        }
        req.session.save((saveErr: any) => {
          if (saveErr) console.error('Session save error during player OAuth:', saveErr);
          res.redirect('/');
        });
      })(req, res, next);
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 OAuth Callback - Received from Google');
        console.log('🔄 OAuth Callback - Processing authentication...');
      }
      passport.authenticate('google-admin', {
        failureRedirect: '/admin/login-failed',
        failureMessage: true
      })(req, res, (err: any) => {
        if (err) {
          if (process.env.NODE_ENV === 'development') {
            console.error('❌ OAuth Callback - Passport error:', err);
          }
          return res.redirect('/admin/login-failed');
        }
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error('Session save error during OAuth:', saveErr);
            return res.redirect('/admin/login-failed');
          }
          res.redirect('/admin/console');
        });
      });
    }
  });

  // Player API routes
  app.get('/api/player/me', async (req: any, res: any) => {
    if (req.session?.playerUser) {
      const playerUser = req.session.playerUser;
      const adminEmails = process.env.ADMIN_EMAILS?.split(',').map((e: string) => e.trim()) || [];
      const isFullAdmin = adminEmails.includes(playerUser.email);
      const isGameAdmin = !isFullAdmin && (await storage.getGamesByAdminEmail(playerUser.email)).length > 0;
      res.json({ ...playerUser, isAdmin: isFullAdmin || isGameAdmin });
    } else {
      res.status(401).json({ error: 'Not logged in as player' });
    }
  });

  // One-click play for admins/game-admins already logged in
  app.post('/api/player/login-as-admin', async (req: any, res: any) => {
    if (!req.user?.isAdmin) {
      return res.status(401).json({ error: 'Not logged in as admin' });
    }
    try {
      const playerUser = await storage.upsertPlayerUser({
        googleId: req.user.id,
        email: req.user.email,
        displayName: req.user.name,
      });
      req.session.playerUser = playerUser;
      req.session.save((err: any) => {
        if (err) console.error('Session save error during admin-as-player login:', err);
      });
      res.json(playerUser);
    } catch (err) {
      res.status(500).json({ error: 'Failed to set up player account' });
    }
  });

  app.patch('/api/player/me', async (req: any, res: any) => {
    if (!req.session?.playerUser) {
      return res.status(401).json({ error: 'Not logged in as player' });
    }
    const { displayName } = req.body;
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }
    try {
      const updated = await storage.updatePlayerUserDisplayName(req.session.playerUser.id, displayName.trim());
      req.session.playerUser = updated;
      req.session.save((err: any) => {
        if (err) console.error('Session save error during rename:', err);
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update display name' });
    }
  });

  app.post('/api/player/logout', (req: any, res: any) => {
    const sessionId = req.sessionID;
    delete req.session.playerUser;
    req.session.save((err: any) => {
      if (err) console.error('Session save error:', err);
      // Immediately null out playerUser on any active WS connections from this session
      // so in-flight submit messages are rejected even before the socket closes
      for (const connection of connections.values()) {
        if (connection.wsSessionId === sessionId) {
          connection.playerUser = null;
        }
      }
      res.json({ success: true });
    });
  });

  app.post('/api/player/claim-participants', async (req: any, res: any) => {
    if (!req.session?.playerUser) {
      return res.status(401).json({ error: 'Not logged in as player' });
    }
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Request body must be an array of { participantId, gameCode }' });
    }
    const playerUserId = req.session.playerUser.id;
    let claimed = 0;
    for (const item of items) {
      if (!item?.participantId || !item?.gameCode) continue;
      try {
        const participant = await storage.getParticipant(item.participantId);
        if (!participant) continue;
        // Verify participant belongs to the game identified by this code
        const game = await storage.getGameByCode(item.gameCode);
        if (!game || participant.gameId !== game.id) continue;
        // Only link unclaimed participants
        if (participant.playerUserId !== null) continue;
        const linked = await storage.linkParticipantToPlayer(item.participantId, playerUserId);
        if (linked) claimed++;
      } catch (_) {
        // non-critical
      }
    }
    res.json({ claimed });
  });

  // Check current admin session
  app.get('/api/admin/me', (req: any, res) => {
    if (req.user && req.user.isAdmin) {
      res.json({
        email: req.user.email,
        name: req.user.name,
        isAdmin: true,
        isFullAdmin: req.user.isFullAdmin === true
      });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Admin logout
  app.post('/api/admin/logout', (req: any, res) => {
    req.logout((err: any) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      // Destroy session in PostgreSQL and clear client cookie
      req.session.destroy((sessionErr: any) => {
        if (sessionErr) {
          console.error('Session destruction error:', sessionErr);
          return res.status(500).json({ error: 'Session destruction failed' });
        }
        // Clear the session cookie on client
        res.clearCookie('oak-voting-game-session');
        res.json({ success: true });
      });
    });
  });

  app.get('/api/admin/games', requireAdmin, async (req: any, res) => {
    try {
      let games;
      if (req.user.isFullAdmin) {
        games = await storage.getAllGames();
      } else {
        games = await storage.getGamesByAdminEmail(req.user.email);
      }
      res.json(games);
    } catch (error) {
      console.error('Error fetching admin games:', error);
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // Game Admin management (full admins only)
  app.get('/api/admin/games/:gameId/admins', requireFullAdmin, async (req: any, res) => {
    try {
      const admins = await storage.getGameAdminsByGameId(req.params.gameId);
      res.json(admins);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch game admins' });
    }
  });

  app.post('/api/admin/games/:gameId/admins', requireFullAdmin, async (req: any, res) => {
    try {
      const parsed = insertGameAdminSchema.parse({
        gameId: req.params.gameId,
        email: req.body.email,
        invitedByEmail: req.user.email
      });
      const ga = await storage.createGameAdmin(parsed);
      res.json(ga);
    } catch (error: any) {
      if (error?.code === '23505') {
        res.status(409).json({ error: 'This email is already a game admin' });
      } else {
        res.status(400).json({ error: error?.message || 'Invalid request' });
      }
    }
  });

  app.delete('/api/admin/games/:gameId/admins/:email', requireFullAdmin, async (req: any, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      await storage.deleteGameAdmin(req.params.gameId, email);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove game admin' });
    }
  });

  // Games
  app.post('/api/games', requireFullAdmin, async (req, res) => {
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

  // Update game (with name change restrictions)
  app.patch('/api/games/:gameId', makeGameAccessMiddleware((req) => req.params.gameId), async (req, res) => {
    try {
      const game = await storage.getGame(req.params.gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      // Check if game can be renamed (no live or closed sessions)
      const sessions = await storage.getSessionsByGameId(req.params.gameId);
      const hasActiveOrClosedSessions = sessions.some(
        session => session.status === 'live' || session.status === 'closed'
      );

      if (hasActiveOrClosedSessions && req.body.name && req.body.name !== game.name) {
        res.status(400).json({ 
          error: 'Cannot rename game after sessions have been started or completed',
          canRename: false
        });
        return;
      }

      // Parse and validate update data
      const updateData = insertGameSchema.partial().parse(req.body);
      const updatedGame = await storage.updateGame(req.params.gameId, updateData);
      
      if (!updatedGame) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }
      
      res.json(updatedGame);
    } catch (error) {
      res.status(400).json({ error: 'Invalid game data' });
    }
  });

  // Overall game leaderboard - shows total points across all closed sessions
  app.get('/api/games/:gameId/leaderboard', async (req, res) => {
    try {
      const { gameId } = req.params;
      
      const game = await storage.getGame(gameId);
      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      // Get all closed sessions for this game
      const allSessions = await storage.getSessionsByGameId(gameId);
      const closedSessions = allSessions.filter(s => s.status === 'closed');

      // Get all participants for this game
      const participants = await storage.getParticipantsByGameId(gameId);
      
      // Pre-fetch all session points for closed sessions (optimization)
      const sessionPointsMap = new Map<string, any[]>();
      for (const session of closedSessions) {
        const sessionPoints = await storage.getSessionPointsBySessionId(session.id);
        sessionPointsMap.set(session.id, sessionPoints);
      }
      
      // Calculate overall leaderboard
      const leaderboard = [];
      
      for (const participant of participants) {
        let totalPoints = 0;
        let sessionsPlayed = 0;
        
        // Sum points from all closed sessions using pre-fetched data
        for (const session of closedSessions) {
          const sessionPoints = sessionPointsMap.get(session.id) || [];
          const participantPoints = sessionPoints.find(sp => sp.participantId === participant.id);
          
          if (participantPoints) {
            totalPoints += participantPoints.points;
            sessionsPlayed++;
          }
        }
        
        // Only include participants who have played at least one session
        if (sessionsPlayed > 0) {
          leaderboard.push({
            participantId: participant.id,
            playerUserId: participant.playerUserId ?? null,
            displayName: participant.displayName,
            totalPoints,
            sessionsPlayed
          });
        }
      }
      
      // Sort by total points descending
      leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
      
      res.json({
        leaderboard
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch game leaderboard' });
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

  app.get('/api/admin/games/:gameId/detailed-leaderboard', makeGameAccessMiddleware((req) => req.params.gameId), async (req, res) => {
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
              // Get submission data to include vote and guess
              const submissions = await storage.getSubmissionsBySessionId(session.id);
              const participantSubmission = submissions.find(s => s.participantId === participant.id);
              
              // Calculate actual Yes count for this session
              const actualYesCount = submissions.filter(s => s.vote === 'YES').length;
              
              sessionBreakdown.push({
                sessionId: session.id,
                question: session.question,
                points: participantPoints.points,
                status: session.status,
                vote: participantSubmission?.vote || null,
                guess: participantSubmission?.guessYesCount || null,
                actualYesCount: actualYesCount
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

  app.patch('/api/admin/sessions/:sessionId/participants/:participantId/submission', makeGameAccessMiddleware(async (req) => {
    const session = await storage.getSession(req.params.sessionId);
    return session?.gameId || '';
  }), async (req, res) => {
    try {
      const { sessionId, participantId } = req.params;
      const { vote, guessYesCount } = req.body;

      if (!vote || !['YES', 'NO'].includes(vote)) {
        res.status(400).json({ error: 'vote must be "YES" or "NO"' });
        return;
      }
      if (typeof guessYesCount !== 'number' || !Number.isInteger(guessYesCount) || guessYesCount < 0) {
        res.status(400).json({ error: 'guessYesCount must be a non-negative integer' });
        return;
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      if (session.status !== 'closed') {
        res.status(400).json({ error: 'Can only edit submissions for closed sessions' });
        return;
      }

      const existing = await storage.getSubmission(sessionId, participantId);
      if (!existing) {
        res.status(404).json({ error: 'Submission not found' });
        return;
      }

      await storage.upsertSubmission({
        sessionId,
        participantId,
        vote: vote as 'YES' | 'NO',
        guessYesCount
      });

      await storage.recalculateSessionPoints(sessionId);

      broadcastToAll({
        type: 'leaderboard:updated',
        payload: { gameId: session.gameId }
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update submission' });
    }
  });

  app.get('/api/admin/games/:gameId/export', makeGameAccessMiddleware((req) => req.params.gameId), async (req, res) => {
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
  app.post('/api/games/:gameId/sessions', makeGameAccessMiddleware((req) => req.params.gameId), async (req, res) => {
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

  app.patch('/api/sessions/:sessionId', makeGameAccessMiddleware(async (req) => {
    const session = await storage.getSession(req.params.sessionId);
    return session?.gameId || '';
  }), async (req, res) => {
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

  // Get session stats for admin monitoring
  app.get('/api/sessions/:sessionId/stats', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const submissions = await storage.getSubmissionsBySessionId(req.params.sessionId);
      const sessionRoom = sessionRooms.get(req.params.sessionId);
      
      res.json({
        participantCount: sessionRoom?.size || 0,
        submissionCount: submissions.length,
        status: session.status
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get session stats' });
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

  app.post('/api/sessions/:sessionId/start', makeGameAccessMiddleware(async (req) => {
    const session = await storage.getSession(req.params.sessionId);
    return session?.gameId || '';
  }), async (req, res) => {
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

  app.post('/api/sessions/:sessionId/end', makeGameAccessMiddleware(async (req) => {
    const session = await storage.getSession(req.params.sessionId);
    return session?.gameId || '';
  }), async (req, res) => {
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
  app.patch('/api/participants/:id', async (req: any, res: any) => {
    try {
      if (!req.session?.playerUser) {
        return res.status(401).json({ error: 'Not logged in as player' });
      }
      const { id } = req.params;
      const displayName = req.body?.displayName;
      if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
        return res.status(400).json({ error: 'Display name is required' });
      }
      const participant = await storage.getParticipant(id);
      if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
      }
      if (participant.playerUserId !== req.session.playerUser.id) {
        return res.status(403).json({ error: 'Not authorized to rename this participant' });
      }
      const nameConflict = await storage.getParticipantByGameAndName(participant.gameId, displayName.trim());
      if (nameConflict && nameConflict.id !== id) {
        return res.status(409).json({ error: 'That name is already taken in this game. Please choose a different name.' });
      }
      await storage.updateParticipantDisplayName(id, displayName.trim());
      broadcastToAll({
        type: 'participant:renamed',
        payload: { participantId: id, displayName: displayName.trim(), gameId: participant.gameId }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update display name' });
    }
  });

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
