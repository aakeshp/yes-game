import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { usePlayerAuth } from "@/hooks/use-player-auth";
import { ChevronDown, ChevronUp, LogOut, Pencil, Check, X } from "lucide-react";

interface Session {
  id: string;
  question: string;
  timerSeconds: number;
  status: "draft" | "live" | "closed" | "canceled";
  endsAt?: string;
}

interface Game {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface LeaderboardEntry {
  participantId: string;
  playerUserId?: string | null;
  displayName: string;
  totalPoints: number;
  sessionsPlayed: number;
}

interface AdminUser {
  email: string;
  name: string;
  isAdmin: boolean;
  isFullAdmin: boolean;
}

export default function GameLobby() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { playerUser, isLoading: playerLoading, logout, isLoggingOut, claimParticipants, rename, isRenaming } = usePlayerAuth();

  const { data: adminUser } = useQuery<AdminUser | null>({
    queryKey: ["/api/admin/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const playAsAdminMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/player/login-as-admin"),
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/player/me"], data);
      if (!localStorage.getItem("playerName")) {
        setPlayerName(data.displayName);
      }
    },
  });
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [hasJoinedGame, setHasJoinedGame] = useState(false);
  const [isGameCodeChanged, setIsGameCodeChanged] = useState(false);
  const [claimedThisSession, setClaimedThisSession] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [isLeaderboardCollapsed, setIsLeaderboardCollapsed] = useState(() => {
    const saved = localStorage.getItem("leaderboardCollapsed");
    return saved === "true";
  });
  const [showAllLeaderboard, setShowAllLeaderboard] = useState(() => {
    const saved = localStorage.getItem("showAllLeaderboard");
    return saved === "true";
  });
  const { socket, disconnect } = useWebSocket();

  const renameParticipantMutation = useMutation({
    mutationFn: async ({ participantId, displayName }: { participantId: string; displayName: string }) => {
      await apiRequest("PATCH", `/api/participants/${participantId}`, { displayName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", currentGameId, "leaderboard"] });
      toast({ title: "Name updated", description: "Your display name has been saved." });
    },
    onError: (error: Error) => {
      let description = "Failed to update your display name.";
      try {
        const match = error.message.match(/^\d+: (.*)/s);
        if (match) {
          const parsed = JSON.parse(match[1]);
          if (parsed.error) description = parsed.error;
        }
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  useEffect(() => {
    document.title = "Game Lobby – Yes Game";
  }, []);

  // Load saved data from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem("playerName");
    const savedGameCode = localStorage.getItem("currentGameCode");
    
    if (savedName) {
      setPlayerName(savedName);
    }
    
    if (savedGameCode) {
      setGameCode(savedGameCode);
      setHasJoinedGame(true);
    }
  }, []);

  // Pre-fill name from Google profile and claim existing anonymous participants
  useEffect(() => {
    if (!playerUser) return;

    // Pre-fill display name from Google if no saved name
    const savedName = localStorage.getItem("playerName");
    if (!savedName) {
      setPlayerName(playerUser.displayName);
    }

    // Claim any existing anonymous participants (one-time per session)
    if (!claimedThisSession) {
      setClaimedThisSession(true);
      const items: { participantId: string; gameCode: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("participantId_")) {
          const gameCode = key.replace("participantId_", "");
          const participantId = localStorage.getItem(key);
          if (participantId && gameCode) items.push({ participantId, gameCode });
        }
      }
      if (items.length > 0) {
        claimParticipants(items);
      }
    }
  }, [playerUser?.id]);

  // Extract game code from URL if present
  useEffect(() => {
    const match = location.match(/\/play\/(.+)/);
    if (match) {
      setGameCode(match[1]);
      setHasJoinedGame(true);
    }
  }, [location]);

  const { data: game, isLoading: gameLoading } = useQuery<Game>({
    queryKey: ["/api/games/code", gameCode],
    enabled: !!gameCode && hasJoinedGame,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/games", currentGameId, "sessions"],
    enabled: !!currentGameId,
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["/api/games", currentGameId, "leaderboard"],
    enabled: !!currentGameId,
  });

  useEffect(() => {
    if (game) {
      setCurrentGameId(game.id);
    }
  }, [game]);

  // Listen for session completion events to refresh leaderboard
  useEffect(() => {
    if (!currentGameId) return;

    const handleSessionResults = (data: any) => {
      if (data?.gameId !== currentGameId) return;
      queryClient.invalidateQueries({ queryKey: ["/api/games", currentGameId, "leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games", currentGameId, "sessions"] });
    };

    const handleLeaderboardUpdated = (data: any) => {
      if (data?.gameId !== currentGameId) return;
      queryClient.invalidateQueries({ queryKey: ["/api/games", currentGameId, "leaderboard"] });
    };

    socket.on('session:results', handleSessionResults);
    socket.on('leaderboard:updated', handleLeaderboardUpdated);

    return () => {
      socket.off('session:results', handleSessionResults);
      socket.off('leaderboard:updated', handleLeaderboardUpdated);
    };
  }, [currentGameId, socket]);

  const handleJoinGame = async () => {
    if (!playerUser) {
      toast({ title: "Sign in required", description: "Please sign in with Google to join a game", variant: "destructive" });
      return;
    }

    if (!playerName.trim()) {
      toast({ title: "Error", description: "Please enter your display name", variant: "destructive" });
      return;
    }

    if (!gameCode.trim()) {
      toast({ title: "Error", description: "Please enter a game code", variant: "destructive" });
      return;
    }

    try {
      localStorage.setItem("playerName", playerName);
      
      if (isGameCodeChanged) {
        const oldGameCode = localStorage.getItem("currentGameCode");
        if (oldGameCode) {
          localStorage.removeItem(`participantId_${oldGameCode}`);
        }
        setCurrentGameId(null);
      }
      
      localStorage.setItem("currentGameCode", gameCode);
      setHasJoinedGame(true);
      setIsGameCodeChanged(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to join game", variant: "destructive" });
    }
  };

  const handleLeaveGame = () => {
    localStorage.removeItem("currentGameCode");
    const oldGameCode = gameCode;
    if (oldGameCode) {
      localStorage.removeItem(`participantId_${oldGameCode}`);
    }
    setGameCode("");
    setHasJoinedGame(false);
    setIsGameCodeChanged(false);
    setCurrentGameId(null);
    toast({ title: "Success", description: "Left the game" });
  };

  const handleJoinSession = async (session: Session) => {
    if (!playerUser) {
      toast({ title: "Sign in required", description: "Please sign in with Google to join a session", variant: "destructive" });
      return;
    }

    if (!playerName.trim()) {
      toast({ title: "Error", description: "Please enter your display name first", variant: "destructive" });
      return;
    }

    if (session.status === "closed") {
      navigate(`/results/${session.id}`);
      return;
    }

    try {
      localStorage.setItem("playerName", playerName);
      navigate(`/session/${session.id}?game=${gameCode}`);
    } catch (error) {
      toast({ title: "Error", description: "Failed to join session", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: "secondary",
      live: "destructive", 
      closed: "default",
      canceled: "outline"
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "outline"} data-testid={`status-${status}`}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleLeaderboard = () => {
    const newState = !isLeaderboardCollapsed;
    setIsLeaderboardCollapsed(newState);
    localStorage.setItem("leaderboardCollapsed", String(newState));
  };

  const toggleShowAllLeaderboard = () => {
    const newState = !showAllLeaderboard;
    setShowAllLeaderboard(newState);
    localStorage.setItem("showAllLeaderboard", String(newState));
  };

  const sortSessions = (sessions: Session[]) => {
    const statusPriority: Record<string, number> = {
      'live': 1,
      'closed': 2,
      'draft': 3,
      'canceled': 4
    };

    return [...sessions].sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return 0;
    });
  };

  const calculateRanks = (leaderboard: any[]) => {
    if (!leaderboard || leaderboard.length === 0) return [];
    
    const rankedEntries: Array<{entry: any, rank: number}> = [];
    let currentRank = 1;
    
    leaderboard.forEach((entry, index) => {
      if (index > 0 && entry.totalPoints < leaderboard[index - 1].totalPoints) {
        currentRank = index + 1;
      }
      rankedEntries.push({ entry, rank: currentRank });
    });
    
    return rankedEntries;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-primary">Yes Game</h1>
              <div className="hidden sm:flex space-x-2 text-sm text-muted-foreground">
                <span>Game Lobby</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {playerUser && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    Signed in as <span className="font-medium text-foreground">{playerUser.displayName}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { disconnect(); logout(); }}
                    disabled={isLoggingOut}
                    data-testid="button-player-logout"
                  >
                    <LogOut className="w-4 h-4 mr-1" aria-hidden="true" />
                    Sign Out
                  </Button>
                </div>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/admin")}
                data-testid="button-settings"
              >
                Admin Login
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-lg border border-border">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2">Game Lobby</h2>
              <p className="text-muted-foreground">Join a game and start playing!</p>
            </div>

            {/* Sign-in prompt when not logged in */}
            {!playerLoading && !playerUser && (
              <div className="mb-6 p-5 bg-primary/5 border border-primary/20 rounded-lg text-center">
                {adminUser ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      You're logged in as admin. Jump straight in as a player.
                    </p>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={playAsAdminMutation.isPending}
                      onClick={() => playAsAdminMutation.mutate()}
                      data-testid="button-play-as-admin"
                    >
                      {playAsAdminMutation.isPending ? "Setting up..." : `Play as ${adminUser.name}`}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Sign in with Google to track your scores and play across devices.
                    </p>
                    <a href="/auth/google/player">
                      <Button className="w-full sm:w-auto" data-testid="button-google-signin">
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                      </Button>
                    </a>
                  </>
                )}
              </div>
            )}
            
            {/* Player Name Input */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="player-name">Display Name</Label>
                  {playerUser && hasJoinedGame && !isEditingName && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingNameValue(playerName);
                        setIsEditingName(true);
                      }}
                      data-testid="button-edit-name"
                    >
                      <Pencil className="w-3 h-3 mr-1" aria-hidden="true" />
                      Edit name
                    </Button>
                  )}
                </div>
                <Input
                  id="player-name"
                  type="text"
                  placeholder={playerUser ? playerUser.displayName : "Sign in to play"}
                  value={isEditingName ? editingNameValue : playerName}
                  onChange={(e) => {
                    if (isEditingName) {
                      setEditingNameValue(e.target.value);
                    } else {
                      setPlayerName(e.target.value);
                    }
                  }}
                  className="mt-2"
                  disabled={!playerUser || (hasJoinedGame && !isEditingName)}
                  data-testid="input-player-name"
                />
                {isEditingName && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs"
                      disabled={!editingNameValue.trim() || renameParticipantMutation.isPending}
                      onClick={async () => {
                        const newName = editingNameValue.trim();
                        if (!newName) return;
                        const participantId = localStorage.getItem(`participantId_${gameCode}`);
                        if (participantId) {
                          await renameParticipantMutation.mutateAsync({ participantId, displayName: newName });
                        }
                        localStorage.setItem("playerName", newName);
                        setPlayerName(newName);
                        setIsEditingName(false);
                      }}
                      data-testid="button-save-name"
                    >
                      <Check className="w-3 h-3 mr-1" aria-hidden="true" />
                      {renameParticipantMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      disabled={renameParticipantMutation.isPending}
                      onClick={() => {
                        setEditingNameValue("");
                        setIsEditingName(false);
                      }}
                      data-testid="button-cancel-edit-name"
                    >
                      <X className="w-3 h-3 mr-1" aria-hidden="true" />
                      Cancel
                    </Button>
                  </div>
                )}
                {playerUser && !hasJoinedGame && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEditingName
                      ? "Press ✓ to save your new name or ✕ to cancel."
                      : "Click the pencil to update your display name."}
                  </p>
                )}
              </div>
              
              {/* Game Code Input */}
              <div>
                <Label htmlFor="game-code">Join Game Code</Label>
                <div className="flex space-x-3 mt-2">
                  <Input
                    id="game-code"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={gameCode}
                    onChange={(e) => {
                      const newCode = e.target.value.toUpperCase();
                      setGameCode(newCode);
                      const savedGameCode = localStorage.getItem("currentGameCode");
                      setIsGameCodeChanged(hasJoinedGame && newCode !== savedGameCode);
                    }}
                    className="flex-1"
                    disabled={!playerUser}
                    data-testid="input-game-code"
                  />
                  <Button 
                    onClick={handleJoinGame} 
                    disabled={!playerUser || gameLoading || (hasJoinedGame && !isGameCodeChanged) || !playerName.trim() || !gameCode.trim()} 
                    data-testid="button-join"
                  >
                    {gameLoading ? "Joining..." : 
                     hasJoinedGame && !isGameCodeChanged ? "Joined" : 
                     hasJoinedGame && isGameCodeChanged ? "Switch Game" :
                     "Join Game"}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Game Info */}
            {game && hasJoinedGame && (
              <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground mb-1" data-testid="text-game-name">✅ Joined: {game.name}</h3>
                    <p className="text-sm text-muted-foreground">Game Code: {game.code}</p>
                    <p className="text-sm text-primary mt-1">
                      {isGameCodeChanged ? "Enter different code above to switch games" : "You can now join available sessions below"}
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleLeaveGame}
                    data-testid="button-leave-game"
                  >
                    Leave Game
                  </Button>
                </div>
              </div>
            )}
            
            {/* Overall Leaderboard */}
            {hasJoinedGame && (
              <div className="mt-8 border-t border-border pt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <span aria-hidden="true">🏆</span> Overall Leaderboard
                  </h3>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={toggleLeaderboard}
                    aria-expanded={!isLeaderboardCollapsed}
                    aria-controls="leaderboard-panel"
                    aria-label={isLeaderboardCollapsed ? "Expand leaderboard" : "Collapse leaderboard"}
                    data-testid="button-toggle-leaderboard"
                  >
                    {isLeaderboardCollapsed ? (
                      <ChevronDown className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <ChevronUp className="h-5 w-5" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                
                {!isLeaderboardCollapsed && (
                  <div id="leaderboard-panel">
                    {leaderboardLoading && (
                      <div className="bg-muted/50 rounded-lg border border-border p-8 text-center">
                        <p className="text-muted-foreground">Loading leaderboard...</p>
                      </div>
                    )}
                    {!leaderboardLoading && leaderboardData && leaderboardData.leaderboard.length > 0 && (
                      <>
                        <div className="bg-muted/50 rounded-lg border border-border overflow-hidden">
                          <div className="divide-y divide-border">
                            {(() => {
                              const myParticipantId = localStorage.getItem(`participantId_${gameCode}`);
                              return calculateRanks(leaderboardData.leaderboard)
                                .slice(0, showAllLeaderboard ? leaderboardData.leaderboard.length : 10)
                                .map(({ entry, rank }, index) => {
                                  const isMe =
                                    (!!playerUser && !!entry.playerUserId && entry.playerUserId === playerUser.id) ||
                                    (!!myParticipantId && entry.participantId === myParticipantId);
                                  return (
                                    <div
                                      key={entry.participantId}
                                      className={`flex items-center justify-between p-4 transition-colors hover:bg-muted ${
                                        isMe
                                          ? 'bg-primary/10 border-l-4 border-primary'
                                          : rank <= 3
                                          ? 'bg-yellow-50 dark:bg-yellow-950/20'
                                          : ''
                                      }`}
                                      data-testid={`leaderboard-row-${index}`}
                                    >
                                      <div className="flex items-center gap-4 flex-1">
                                        <div className="flex items-center justify-center w-8 h-8">
                                          {rank === 1 && <span role="img" aria-label="1st place" className="text-2xl">🥇</span>}
                                          {rank === 2 && <span role="img" aria-label="2nd place" className="text-2xl">🥈</span>}
                                          {rank === 3 && <span role="img" aria-label="3rd place" className="text-2xl">🥉</span>}
                                          {rank > 3 && (
                                            <span className="text-sm font-semibold text-muted-foreground" aria-label={`Rank ${rank}`}>
                                              #{rank}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex-1">
                                          <p className={`font-medium ${isMe ? 'text-primary' : 'text-foreground'}`} data-testid={`text-participant-name-${index}`}>
                                            {entry.displayName}
                                            {isMe && <span className="ml-2 text-xs font-normal text-primary/70">(you)</span>}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            {entry.sessionsPlayed} session{entry.sessionsPlayed !== 1 ? 's' : ''} played
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-2xl font-bold text-primary" data-testid={`text-points-${index}`}>
                                          {entry.totalPoints}
                                        </p>
                                        <p className="text-xs text-muted-foreground">points</p>
                                      </div>
                                    </div>
                                  );
                                });
                            })()}
                          </div>
                        </div>
                        {leaderboardData.leaderboard.length > 10 && (
                          <div className="text-center mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={toggleShowAllLeaderboard}
                              data-testid="button-show-more-leaderboard"
                            >
                              {showAllLeaderboard ? (
                                <>Show Less</>
                              ) : (
                                <>Show More ({leaderboardData.leaderboard.length - 10} more)</>
                              )}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                    {!leaderboardLoading && leaderboardData && leaderboardData.leaderboard.length === 0 && (
                      <div className="bg-muted/50 rounded-lg border border-border p-8 text-center">
                        <p className="text-muted-foreground">
                          No participants have completed any sessions yet. Complete a session to appear on the leaderboard!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Sessions List */}
            {hasJoinedGame && sessions && sessions.length > 0 && (
              <div className="mt-8 border-t border-border pt-8">
                <h3 className="text-lg font-semibold text-foreground mb-4">Available Sessions</h3>
                <div className="space-y-3">
                  {sortSessions(sessions).map((session: Session) => (
                    <div key={session.id} className="bg-muted rounded-lg p-4 border border-border hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-1">
                            {getStatusBadge(session.status)}
                            <h4 className="font-medium text-foreground" data-testid={`text-question-${session.id}`}>
                              {session.question}
                            </h4>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {session.status === 'draft' && `Timer: ${formatTimer(session.timerSeconds)}`}
                            {session.status === 'live' && session.endsAt && `Ends at: ${new Date(session.endsAt).toLocaleTimeString()}`}
                            {session.status === 'closed' && 'Completed'}
                          </p>
                        </div>
                        <Button
                          variant={session.status === 'live' ? 'destructive' : session.status === 'closed' ? 'outline' : 'secondary'}
                          size="sm"
                          onClick={() => handleJoinSession(session)}
                          disabled={session.status === 'draft' || !playerUser}
                          data-testid={`button-join-session-${session.id}`}
                        >
                          {session.status === 'live' ? 'Join Live' : session.status === 'closed' ? 'View Results' : session.status === 'draft' ? 'Coming Soon' : 'Join Session'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasJoinedGame && sessionsLoading && currentGameId && (
              <div className="mt-8 text-center">
                <p className="text-muted-foreground">Loading sessions...</p>
              </div>
            )}
            
            {hasJoinedGame && sessions && sessions.length === 0 && (
              <div className="mt-8 p-4 bg-muted rounded-lg text-center">
                <p className="text-muted-foreground">No sessions available yet. Check back later or contact the game admin.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
