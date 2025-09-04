import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users } from "lucide-react";

interface SessionResults {
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
}

interface Game {
  id: string;
  name: string;
  leaderboard: Array<{
    participantId: string;
    displayName: string;
    totalPoints: number;
    sessionsPlayed: number;
  }>;
}

interface SessionWithResults {
  id: string;
  gameId: string;
  results?: SessionResults;
}

export default function Results() {
  const [location, navigate] = useLocation();
  const [sessionId, setSessionId] = useState<string>("");
  const queryClient = useQueryClient();

  // Extract session ID from URL
  useEffect(() => {
    const match = location.match(/\/results\/(.+)/);
    if (match) {
      setSessionId(match[1]);
    }
  }, [location]);

  const { data: session, isLoading, refetch } = useQuery<SessionWithResults>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
    refetchInterval: (data) => {
      // Keep refetching every 2 seconds if we don't have results yet
      return data?.results ? false : 2000;
    },
    refetchIntervalInBackground: false,
  });

  const { data: game } = useQuery<Game>({
    queryKey: ["/api/games", session?.gameId],
    enabled: !!session?.gameId && !!session?.results, // Wait for results to be available
    refetchOnMount: true, // Always fetch fresh data when component mounts
  });

  const handleBackToLobby = () => {
    // Invalidate ALL relevant caches to ensure fresh data in lobby
    if (session?.gameId) {
      // Game-specific data (includes leaderboard updates)
      queryClient.invalidateQueries({ queryKey: ["/api/games", session.gameId] });
      queryClient.invalidateQueries({ queryKey: ["/api/games", session.gameId, "sessions"] });
      
      // Admin detailed leaderboard (CRITICAL for leaderboard page refresh)
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games", session.gameId, "detailed-leaderboard"] });
      
      // Game-by-code queries (for lobby access)
      queryClient.invalidateQueries({ queryKey: ["/api/games/code"] });
      
      // Session-specific data (in case user revisits)
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
      
      // Admin data if applicable
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      
      // Invalidate any other game queries that might exist
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && (
            key.startsWith("/api/games") || 
            key.startsWith("/api/sessions") ||
            key.startsWith("/api/admin")
          );
        }
      });
    }
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Loading results...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Session not found</p>
            <Button onClick={handleBackToLobby} className="mt-4">
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session.results) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                {session.status === 'live' ? 'Session still in progress...' : 'Calculating results...'}
              </p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">
                Results will appear automatically when ready
              </p>
            </div>
            <Button onClick={handleBackToLobby} className="mt-4" variant="outline">
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const results: SessionResults = session.results;
  const winners = results.participants.filter(p => p.points === 5);
  const closeGuessers = results.participants.filter(p => p.points === 3);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-primary">Yes Game</h1>
              <div className="hidden sm:flex space-x-2 text-sm text-muted-foreground">
                <span>Session Results</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleBackToLobby} data-testid="button-back-lobby">
              Back to Lobby
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Results Header */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-foreground mb-4">Session Results</h2>
              <p className="text-lg text-muted-foreground mb-6" data-testid="text-question">
                "{results.question}"
              </p>
              
              {/* Vote Totals */}
              <div className="bg-muted rounded-lg p-6 mb-6">
                <div className="grid grid-cols-2 gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-secondary mb-2" data-testid="text-yes-count">
                      {results.yesCount}
                    </div>
                    <div className="text-lg font-medium text-foreground">YES Votes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-destructive mb-2" data-testid="text-no-count">
                      {results.noCount}
                    </div>
                    <div className="text-lg font-medium text-foreground">NO Votes</div>
                  </div>
                </div>
              </div>

              {/* Winners Announcement */}
              {winners.length > 0 && (
                <div className="bg-gradient-to-r from-accent to-accent/80 rounded-lg p-6 mb-6 text-accent-foreground">
                  <div className="flex items-center justify-center space-x-2 mb-4">
                    <Trophy className="w-6 h-6" />
                    <h3 className="text-xl font-bold">Winners (Exact Guess)</h3>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4">
                    {winners.map((winner) => (
                      <div key={winner.participantId} className="bg-white/20 rounded-lg px-4 py-2">
                        <span className="font-medium" data-testid={`winner-${winner.participantId}`}>
                          {winner.displayName}
                        </span>
                        <span className="text-sm opacity-90 ml-2">5 points</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Guessers */}
              {closeGuessers.length > 0 && (
                <div className="bg-secondary/10 rounded-lg p-4 mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Close Guesses (±1)</h3>
                  <div className="flex flex-wrap justify-center gap-2">
                    {closeGuessers.map((guesser) => (
                      <Badge key={guesser.participantId} variant="secondary">
                        {guesser.displayName} - 3 points
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Participant Results Table */}
        <Card className="shadow-lg border border-border overflow-hidden mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>All Participants</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Vote
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Guess
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.participants.map((participant) => (
                    <tr key={participant.participantId} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-3 ${
                            participant.vote === "YES" ? "bg-secondary" : 
                            participant.vote === "NO" ? "bg-destructive" : "bg-muted-foreground"
                          }`}></div>
                          <span className="font-medium text-foreground" data-testid={`participant-name-${participant.participantId}`}>
                            {participant.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {participant.vote ? (
                          <Badge 
                            variant={participant.vote === "YES" ? "secondary" : "destructive"}
                            data-testid={`participant-vote-${participant.participantId}`}
                          >
                            {participant.vote}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">No vote</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                        <span data-testid={`participant-guess-${participant.participantId}`}>
                          {participant.guess !== null ? participant.guess : "No guess"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge 
                          variant={participant.points === 5 ? "default" : participant.points === 3 ? "secondary" : "outline"}
                          data-testid={`participant-points-${participant.participantId}`}
                        >
                          {participant.points}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Game Leaderboard */}
        {game?.leaderboard && game.leaderboard.length > 0 && (
          <Card className="shadow-lg border border-border">
            <CardHeader>
              <CardTitle>Game Leaderboard</CardTitle>
              <p className="text-sm text-muted-foreground">Cumulative points across all sessions</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {game.leaderboard.slice(0, 10).map((player: Game['leaderboard'][0], index: number) => (
                  <div key={player.participantId} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-foreground" data-testid={`leaderboard-name-${player.participantId}`}>
                          {player.displayName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {player.sessionsPlayed} sessions played
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary" data-testid={`leaderboard-points-${player.participantId}`}>
                        {player.totalPoints}
                      </div>
                      <div className="text-sm text-muted-foreground">total points</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
