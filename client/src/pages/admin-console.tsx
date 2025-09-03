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
import { Settings, Play, RotateCcw, ExternalLink, Copy } from "lucide-react";

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

  // Extract game ID from URL
  useEffect(() => {
    const match = location.match(/\/admin\/games\/(.+)/);
    if (match) {
      setGameId(match[1]);
    }
  }, [location]);

  const { data: game } = useQuery({
    queryKey: ["/api/games", gameId],
    enabled: !!gameId,
  });

  const { data: sessions } = useQuery({
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

  const startSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/start`);
      return response.json();
    },
    onSuccess: (data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "sessions"] });
      toast({ title: "Success", description: "Session started successfully" });
      // Navigate to live view
      navigate(`/admin/sessions/${sessionId}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start session", variant: "destructive" });
    }
  });

  const restartSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/restart`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "sessions"] });
      toast({ title: "Success", description: "Session restarted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restart session", variant: "destructive" });
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

  const handleRestartSession = (sessionId: string) => {
    restartSessionMutation.mutate(sessionId);
  };

  const handlePlayAsParticipant = () => {
    if (game) {
      const playUrl = `${window.location.origin}/play/${game.code}`;
      window.open(playUrl, '_blank');
    }
  };

  const handleCopyJoinLink = () => {
    if (game) {
      const joinUrl = `${window.location.origin}/play/${game.code}`;
      navigator.clipboard.writeText(joinUrl).then(() => {
        toast({ title: "Success", description: "Join link copied to clipboard" });
      });
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

  const getCurrentDraftSession = () => {
    return sessions?.find((s: Session) => s.status === 'draft');
  };

  const currentDraftSession = getCurrentDraftSession();
  const hasLiveSession = sessions?.some((s: Session) => s.status === 'live');

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
              <Button variant="ghost" size="sm" data-testid="button-settings">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
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
                    <Input value={game.name} readOnly className="mt-1" data-testid="input-game-name" />
                  </div>
                  <div>
                    <Label>Join Code</Label>
                    <div className="flex items-center space-x-3 mt-1">
                      <Input value={game.code} readOnly className="flex-1" data-testid="text-game-code" />
                      <Button 
                        size="sm" 
                        onClick={handleCopyJoinLink}
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                        data-testid="button-copy-link"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copy Link
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
                    onClick={handlePlayAsParticipant}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid="button-play-participant"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Play as Participant
                  </Button>
                  <Button variant="outline" className="w-full" data-testid="button-switch-view">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Switch: Admin ↔ Player
                  </Button>
                  <Button variant="outline" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-export">
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
                      <SelectItem value="120">2 minutes</SelectItem>
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
                      onClick={() => currentDraftSession && handleStartSession(currentDraftSession.id)}
                      disabled={!currentDraftSession || startSessionMutation.isPending}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      data-testid="button-start-session"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      {startSessionMutation.isPending ? "Starting..." : "Start Session"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => currentDraftSession && handleRestartSession(currentDraftSession.id)}
                      disabled={!currentDraftSession || restartSessionMutation.isPending}
                      data-testid="button-restart-session"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      {restartSessionMutation.isPending ? "Restarting..." : "Restart"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Current Session Info */}
                {currentDraftSession && (
                  <div className="bg-muted rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground mb-1" data-testid="text-current-session-question">
                          {currentDraftSession.question}
                        </h4>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>Timer: <span data-testid="text-current-session-timer">{currentDraftSession.timerSeconds}s</span></span>
                          {getStatusBadge(currentDraftSession.status)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Participants</div>
                        <div className="text-xl font-bold text-primary">0</div>
                      </div>
                    </div>
                  </div>
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
