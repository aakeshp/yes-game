import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

export default function GameLobby() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  // Load player name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // Extract game code from URL if present
  useEffect(() => {
    const match = location.match(/\/play\/(.+)/);
    if (match) {
      setGameCode(match[1]);
    }
  }, [location]);

  const { data: game, isLoading: gameLoading } = useQuery<Game>({
    queryKey: ["/api/games/code", gameCode],
    enabled: !!gameCode,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/games", currentGameId, "sessions"],
    enabled: !!currentGameId,
  });

  useEffect(() => {
    if (game) {
      setCurrentGameId(game.id);
    }
  }, [game]);

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      toast({ title: "Error", description: "Please enter your name", variant: "destructive" });
      return;
    }

    if (!gameCode.trim()) {
      toast({ title: "Error", description: "Please enter a game code", variant: "destructive" });
      return;
    }

    try {
      localStorage.setItem("playerName", playerName);
      localStorage.setItem(`participantId_${gameCode}`, ""); // Will be set when we join a session
      
      // Navigate to play URL to trigger game loading
      navigate(`/play/${gameCode}`);
    } catch (error) {
      toast({ title: "Error", description: "Failed to join game", variant: "destructive" });
    }
  };

  const handleJoinSession = async (session: Session) => {
    if (!playerName.trim()) {
      toast({ title: "Error", description: "Please enter your name first", variant: "destructive" });
      return;
    }

    if (session.status === "closed") {
      navigate(`/results/${session.id}`);
      return;
    }

    try {
      // Create or get participant
      const participantResponse = await apiRequest("POST", "/api/participants", {
        gameId: currentGameId,
        displayName: playerName,
      });
      const participant = await participantResponse.json();
      localStorage.setItem(`participantId_${gameCode}`, participant.id);
      
      navigate(`/session/${session.id}`);
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
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/admin/setup")}
                data-testid="button-settings"
              >
                Admin Setup
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-lg border border-border">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2">Game Lobby</h2>
              <p className="text-muted-foreground">Join a game and start playing!</p>
            </div>
            
            {/* Player Name Input */}
            <div className="space-y-6">
              <div>
                <Label htmlFor="player-name">Enter Name</Label>
                <Input
                  id="player-name"
                  type="text"
                  placeholder="Your display name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mt-2"
                  data-testid="input-player-name"
                />
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
                    onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                    className="flex-1"
                    data-testid="input-game-code"
                  />
                  <Button onClick={handleJoinGame} disabled={gameLoading} data-testid="button-join">
                    {gameLoading ? "Joining..." : "Join"}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Game Info */}
            {game && (
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h3 className="font-semibold text-foreground mb-1" data-testid="text-game-name">{game.name}</h3>
                <p className="text-sm text-muted-foreground">Game Code: {game.code}</p>
              </div>
            )}
            
            {/* Sessions List */}
            {sessions && sessions.length > 0 && (
              <div className="mt-8 border-t border-border pt-8">
                <h3 className="text-lg font-semibold text-foreground mb-4">Available Sessions</h3>
                <div className="space-y-3">
                  {sessions.map((session: Session) => (
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
                          data-testid={`button-join-session-${session.id}`}
                        >
                          {session.status === 'live' ? 'Join Live' : session.status === 'closed' ? 'View Results' : 'Join Session'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sessionsLoading && currentGameId && (
              <div className="mt-8 text-center">
                <p className="text-muted-foreground">Loading sessions...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
