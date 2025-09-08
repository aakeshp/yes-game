import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Play, ExternalLink, Copy, Users, Edit2, Lock, ArrowLeft } from "lucide-react";

interface Session {
  id: string;
  gameId: string;
  question: string;
  timerSeconds: number;
  status: "draft" | "live" | "closed" | "canceled";
  startedAt?: string;
  endsAt?: string;
  createdAt: string;
}

interface Game {
  id: string;
  name: string;
  code: string;
  status: string;
}

export default function AdminConsole() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [gameId, setGameId] = useState<string>("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newTimer, setNewTimer] = useState("30");
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editTimer, setEditTimer] = useState("30");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [isEditingGameName, setIsEditingGameName] = useState(false);
  const [editGameName, setEditGameName] = useState("");

  // Check if admin is authenticated
  // Check authentication with Google OAuth
  const { data: adminUser, isLoading: authLoading } = useQuery<{isAdmin: boolean, name: string, email: string}>({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  useEffect(() => {
    if (!authLoading && !adminUser?.isAdmin) {
      toast({ title: "Authentication Required", description: "Please sign in to access the admin console", variant: "destructive" });
      navigate("/admin");
    }
  }, [adminUser, authLoading, navigate, toast]);

  // Extract game ID from URL
  useEffect(() => {
    const match = location.match(/\/admin\/games\/(.+)/);
    if (match) {
      setGameId(match[1]);
    }
  }, [location]);

  const { data: game } = useQuery<Game>({
    queryKey: ["/api/games", gameId],
    enabled: !!gameId,
  });

  // Get list of all games for admin
  const { data: adminGames } = useQuery<Game[]>({
    queryKey: ["/api/admin/games"],
    enabled: !gameId, // Only load when no specific game is selected
  });

  const { data: sessions } = useQuery<Session[]>({
    queryKey: ["/api/games", gameId, "sessions"],
    enabled: !!gameId,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { question: string; timerSeconds: number }) => {
      const response = await apiRequest("POST", `/api/games/${gameId}/sessions`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "sessions"] });
      setNewQuestion("");
      toast({ title: "Success", description: "Session created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create session", variant: "destructive" });
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ sessionId, updates }: { sessionId: string; updates: { question: string; timerSeconds: number } }) => {
      const response = await apiRequest("PATCH", `/api/sessions/${sessionId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Session updated successfully" });
      setEditingSession(null);
      setEditQuestion("");
      setEditTimer("30");
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "sessions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update session", variant: "destructive" });
    }
  });

  const createGameMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/games", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      toast({ title: "Success", description: "Game created successfully" });
      setShowCreateGame(false);
      setNewGameName("");
      // Navigate to the new game's admin console
      navigate(`/admin/games/${data.gameId}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create game", variant: "destructive" });
    }
  });

  const startSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/start`);
      return response.json();
    },
    onSuccess: (data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "sessions"] });
      toast({ title: "Success", description: "Session started - redirecting to game lobby" });
      // Navigate to game lobby so admin can enter display name like other players
      navigate(`/play/${game?.code}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start session", variant: "destructive" });
    }
  });


  const handleCreateSession = () => {
    if (!newQuestion.trim()) {
      toast({ title: "Error", description: "Please enter a question", variant: "destructive" });
      return;
    }
    createSessionMutation.mutate({
      question: newQuestion.trim(),
      timerSeconds: parseInt(newTimer, 10)
    });
  };

  const handleStartSession = (sessionId: string) => {
    startSessionMutation.mutate(sessionId);
  };


  const handleViewLeaderboard = () => {
    if (game) {
      navigate(`/admin/games/${game.id}/leaderboard`);
    }
  };

  const handleExportResults = () => {
    if (game) {
      const exportUrl = `/api/admin/games/${game.id}/export`;
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = `${game.name}_results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export Started",
        description: "Your game results are being downloaded as a CSV file.",
        variant: "default"
      });
    }
  };

  const handleCopyJoinCode = () => {
    if (game) {
      navigator.clipboard.writeText(game.code).then(() => {
        toast({ title: "Success", description: "Game code copied to clipboard" });
      });
    }
  };

  const handleCreateGame = () => {
    if (!newGameName.trim()) {
      toast({ title: "Error", description: "Please enter a game name", variant: "destructive" });
      return;
    }
    createGameMutation.mutate({ name: newGameName.trim() });
  };

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/logout", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      toast({ title: "Success", description: "Logged out successfully" });
      navigate("/");
    },
    onError: () => {
      toast({ title: "Error", description: "Logout failed", variant: "destructive" });
    }
  });

  const updateGameMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("PATCH", `/api/games/${gameId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
      toast({ title: "Success", description: "Game name updated successfully" });
      setIsEditingGameName(false);
      setEditGameName("");
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to update game name";
      toast({ title: "Error", description: message, variant: "destructive" });
      setIsEditingGameName(false);
      setEditGameName("");
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Check if game can be renamed (no live or closed sessions)
  const canRenameGame = sessions ? !sessions.some(session => session.status === 'live' || session.status === 'closed') : true;

  const handleStartEditGameName = () => {
    if (game) {
      setEditGameName(game.name);
      setIsEditingGameName(true);
    }
  };

  const handleCancelEditGameName = () => {
    setIsEditingGameName(false);
    setEditGameName("");
  };

  const handleSaveGameName = () => {
    if (!editGameName.trim()) {
      toast({ title: "Error", description: "Please enter a game name", variant: "destructive" });
      return;
    }
    if (editGameName.trim() === game?.name) {
      setIsEditingGameName(false);
      return;
    }
    updateGameMutation.mutate({ name: editGameName.trim() });
  };

  const handleUpdateSession = () => {
    if (!editQuestion.trim()) {
      toast({ title: "Error", description: "Please enter a question", variant: "destructive" });
      return;
    }
    if (!editingSession) return;
    
    updateSessionMutation.mutate({
      sessionId: editingSession.id,
      updates: {
        question: editQuestion.trim(),
        timerSeconds: parseInt(editTimer)
      }
    });
  };

  const handleCancelEdit = () => {
    setEditingSession(null);
    setEditQuestion("");
    setEditTimer("30");
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

  // Get all draft sessions
  const draftSessions = sessions?.filter((s: Session) => s.status === 'draft') || [];
  
  // Get selected session or auto-select first draft session
  const selectedSession = selectedSessionId 
    ? draftSessions.find(s => s.id === selectedSessionId) 
    : draftSessions[0] || null;
  
  // Auto-select first draft session if none selected and sessions exist
  useEffect(() => {
    if (!selectedSessionId && draftSessions.length > 0) {
      setSelectedSessionId(draftSessions[0].id);
    }
  }, [selectedSessionId, draftSessions]);
  const hasLiveSession = sessions?.some((s: Session) => s.status === 'live');

  // Show game selection when no specific game is selected
  if (!gameId) {
    return (
      <div className="min-h-screen bg-background">
        {/* Navigation Header */}
        <header className="bg-card border-b border-border shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-primary">Yes Game</h1>
                <div className="hidden sm:flex space-x-2 text-sm text-muted-foreground">
                  <span>Admin Console</span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Admin: {adminUser?.name || adminUser?.email}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/")}
                  data-testid="button-back-home"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Back to Game Lobby
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  data-testid="button-logout"
                >
                  {logoutMutation.isPending ? "Logging out..." : "Logout"}
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Select a Game to Manage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Create New Game Section */}
                <div className="border-b pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Create New Game</h3>
                    {!showCreateGame && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowCreateGame(true)}
                        data-testid="button-show-create-game"
                      >
                        + New Game
                      </Button>
                    )}
                  </div>
                  
                  {showCreateGame && (
                    <div className="space-y-3 bg-muted/30 p-4 rounded-lg">
                      <div>
                        <Label htmlFor="game-name">Game Name</Label>
                        <Input
                          id="game-name"
                          placeholder="Enter game name..."
                          value={newGameName}
                          onChange={(e) => setNewGameName(e.target.value)}
                          className="mt-1"
                          data-testid="input-game-name"
                        />
                      </div>
                      <div className="flex items-center space-x-3">
                        <Button 
                          onClick={handleCreateGame}
                          disabled={createGameMutation.isPending || !newGameName.trim()}
                          data-testid="button-create-game"
                        >
                          {createGameMutation.isPending ? "Creating..." : "Create Game"}
                        </Button>
                        <Button 
                          variant="ghost" 
                          onClick={() => {
                            setShowCreateGame(false);
                            setNewGameName("");
                          }}
                          data-testid="button-cancel-create"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Existing Games List */}
                {adminGames && adminGames.length > 0 ? (
                  <div>
                    <h3 className="font-medium mb-3">Your Games</h3>
                    <div className="space-y-3">
                      {adminGames.map((adminGame) => (
                        <div 
                          key={adminGame.id}
                          className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => navigate(`/admin/games/${adminGame.id}`)}
                          data-testid={`game-option-${adminGame.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium">{adminGame.name}</h3>
                              <p className="text-sm text-muted-foreground">Code: {adminGame.code}</p>
                            </div>
                            <Button variant="outline" size="sm">
                              Manage →
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No games found. Create your first game to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show loading if game ID exists but game data hasn't loaded yet
  if (!game) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Loading game...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-primary">Yes Game</h1>
              <div className="hidden sm:flex space-x-2 text-sm text-muted-foreground">
                <span>Admin Console</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Admin: {adminUser?.name || adminUser?.email}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/admin")}
                  data-testid="button-back-games"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Games
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/")}
                  data-testid="button-back-home"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Back to Game Lobby
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  data-testid="button-logout"
                >
                  {logoutMutation.isPending ? "Logging out..." : "Logout"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Game Settings Card */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-foreground mb-6">Admin Console</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Game Info */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Game Settings</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Game Name</Label>
                    {isEditingGameName ? (
                      <div className="flex items-center space-x-2 mt-1">
                        <Input 
                          value={editGameName}
                          onChange={(e) => setEditGameName(e.target.value)}
                          placeholder="Enter game name..."
                          className="flex-1"
                          data-testid="input-edit-game-name"
                        />
                        <Button 
                          size="sm" 
                          onClick={handleSaveGameName}
                          disabled={updateGameMutation.isPending}
                          data-testid="button-save-game-name"
                        >
                          {updateGameMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={handleCancelEditGameName}
                          disabled={updateGameMutation.isPending}
                          data-testid="button-cancel-edit-game-name"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 mt-1">
                        <Input 
                          value={game.name} 
                          readOnly 
                          className="flex-1" 
                          data-testid="input-game-name" 
                        />
                        {canRenameGame ? (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={handleStartEditGameName}
                            data-testid="button-edit-game-name"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Rename
                          </Button>
                        ) : (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Lock className="w-4 h-4 mr-1" />
                            <span>Locked after sessions start</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Join Code</Label>
                    <div className="flex items-center space-x-3 mt-1">
                      <Input value={game.code} readOnly className="flex-1" data-testid="text-game-code" />
                      <Button 
                        size="sm" 
                        onClick={handleCopyJoinCode}
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                        data-testid="button-copy-code"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copy Code
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Button 
                    onClick={handleViewLeaderboard}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid="button-view-leaderboard"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    View Leaderboard
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90" 
                    onClick={handleExportResults}
                    data-testid="button-export"
                  >
                    📊 Export Results
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Lock Banner */}
        {hasLiveSession && (
          <Card className="bg-accent text-accent-foreground mb-6">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-accent-foreground rounded-full animate-pulse"></div>
                <span className="font-medium">Session is live — configuration locked; restart disabled after first submission</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Create Session Card */}
          <div className="xl:col-span-1">
            <Card className="shadow-lg border border-border">
              <CardHeader>
                <CardTitle>Create Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="session-question">Question</Label>
                  <Textarea
                    id="session-question"
                    placeholder="Enter your question..."
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="mt-1 resize-none"
                    rows={3}
                    data-testid="input-session-question"
                  />
                </div>
                <div>
                  <Label>Timer (seconds)</Label>
                  <Select value={newTimer} onValueChange={setNewTimer}>
                    <SelectTrigger className="mt-1" data-testid="select-timer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 seconds</SelectItem>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">60 seconds</SelectItem>
                      <SelectItem value="90">90 seconds</SelectItem>
                      <SelectItem value="120">120 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleCreateSession}
                  disabled={createSessionMutation.isPending || !newQuestion.trim()}
                  className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  data-testid="button-create-session"
                >
                  {createSessionMutation.isPending ? "Creating..." : "Create Session"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Session Control Card */}
          <div className="xl:col-span-2">
            <Card className="shadow-lg border border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Session Control</CardTitle>
                  <div className="flex space-x-3">
                    <Button
                      onClick={() => selectedSession && handleStartSession(selectedSession.id)}
                      disabled={!selectedSession || startSessionMutation.isPending}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      data-testid="button-start-session"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      {startSessionMutation.isPending ? "Starting..." : "Start Selected Session"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Session Selection */}
                {draftSessions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-foreground mb-3">Select Session to Start:</h4>
                    <div className="space-y-2">
                      {draftSessions.map((session) => (
                        <div 
                          key={session.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedSessionId === session.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border bg-muted hover:bg-muted/80'
                          }`}
                          onClick={() => setSelectedSessionId(session.id)}
                          data-testid={`session-option-${session.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h5 className="font-medium text-foreground mb-1">
                                {session.question}
                              </h5>
                              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                <span>Timer: {session.timerSeconds}s</span>
                                {getStatusBadge(session.status)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">Participants</div>
                              <div className="text-lg font-semibold text-primary">0</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {draftSessions.length === 0 && (
                  <div className="bg-muted rounded-lg p-4 mb-4 text-center">
                    <p className="text-muted-foreground">No draft sessions available. Create a session to get started.</p>
                  </div>
                )}

                {/* Edit Session Form */}
                {editingSession && (
                  <Card className="border-2 border-accent bg-accent/5 mb-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Edit Session</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="edit-question">Question</Label>
                        <Input
                          id="edit-question"
                          type="text"
                          placeholder="Enter your Yes/No question"
                          value={editQuestion}
                          onChange={(e) => setEditQuestion(e.target.value)}
                          className="mt-1"
                          data-testid="input-edit-question"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-timer">Timer (seconds)</Label>
                        <Input
                          id="edit-timer"
                          type="number"
                          min="10"
                          max="300"
                          value={editTimer}
                          onChange={(e) => setEditTimer(e.target.value)}
                          className="mt-1"
                          data-testid="input-edit-timer"
                        />
                      </div>
                      <div className="flex space-x-3">
                        <Button 
                          onClick={handleUpdateSession}
                          disabled={updateSessionMutation.isPending || !editQuestion.trim()}
                          className="flex-1"
                          data-testid="button-save-session"
                        >
                          {updateSessionMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={handleCancelEdit}
                          data-testid="button-cancel-edit"
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Session List */}
                <div>
                  <h4 className="font-medium text-foreground mb-3">All Sessions</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {sessions && sessions.length > 0 ? (
                      sessions.map((session: Session) => (
                        <div key={session.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              {getStatusBadge(session.status)}
                              <span className="font-medium text-foreground text-sm" data-testid={`session-question-${session.id}`}>
                                {session.question}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {session.status === 'draft' && `Created: ${new Date(session.createdAt).toLocaleTimeString()}`}
                              {session.status === 'live' && session.endsAt && `Ends at: ${new Date(session.endsAt).toLocaleTimeString()}`}
                              {session.status === 'closed' && 'Completed'}
                            </div>
                          </div>
                          <Button 
                            size="sm"
                            variant={session.status === 'live' ? 'destructive' : 'default'}
                            onClick={() => {
                              if (session.status === 'live') {
                                navigate(`/admin/sessions/${session.id}`);
                              } else if (session.status === 'closed') {
                                navigate(`/results/${session.id}`);
                              } else if (session.status === 'draft') {
                                setEditingSession(session);
                                setEditQuestion(session.question);
                                setEditTimer(session.timerSeconds.toString());
                              }
                            }}
                            data-testid={`button-session-action-${session.id}`}
                          >
                            {session.status === 'live' ? 'Monitor' : session.status === 'closed' ? 'View' : 'Edit'}
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-center py-4">No sessions created yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
