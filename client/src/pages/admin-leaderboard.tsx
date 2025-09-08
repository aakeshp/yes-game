import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, Medal, Award, ChevronDown, ChevronRight, Eye } from "lucide-react";

interface GameWithDetailedLeaderboard {
  id: string;
  name: string;
  code: string;
  leaderboard: Array<{
    participantId: string;
    displayName: string;
    totalPoints: number;
    sessionsPlayed: number;
    sessionBreakdown: Array<{
      sessionId: string;
      question: string;
      points: number;
      status: string;
    }>;
  }>;
}

export default function AdminLeaderboard() {
  const [location, navigate] = useLocation();
  const [gameId, setGameId] = useState<string>("");
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());

  // Extract game ID from URL
  useEffect(() => {
    const match = location.match(/\/admin\/games\/(.+)\/leaderboard/);
    if (match) {
      setGameId(match[1]);
    }
  }, [location]);

  const toggleParticipantDetails = (participantId: string) => {
    const newExpanded = new Set(expandedParticipants);
    if (newExpanded.has(participantId)) {
      newExpanded.delete(participantId);
    } else {
      newExpanded.add(participantId);
    }
    setExpandedParticipants(newExpanded);
  };

  const { data: gameData, isLoading } = useQuery<GameWithDetailedLeaderboard>({
    queryKey: ["/api/admin/games", gameId, "detailed-leaderboard"],
    enabled: !!gameId,
  });

  const handleBackToAdmin = () => {
    navigate(`/admin/games/${gameId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Loading leaderboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Game not found</p>
            <Button onClick={() => navigate("/admin/setup")} className="mt-4">
              Back to Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getRankIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="w-6 h-6 text-primary" />;
      case 2:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 3:
        return <Award className="w-6 h-6 text-accent" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-muted-foreground font-bold">#{position}</span>;
    }
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
                <span>Leaderboard - {gameData.name}</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToAdmin}
              data-testid="button-back-admin"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin Console
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Game Info */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{gameData.name}</h2>
                <p className="text-muted-foreground">Game Code: {gameData.code}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{gameData.leaderboard.length}</div>
                <div className="text-sm text-muted-foreground">Total Participants</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="shadow-lg border border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trophy className="w-6 h-6 mr-2 text-primary" />
              Detailed Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gameData.leaderboard.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No participants yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {gameData.leaderboard.map((participant, index) => (
                  <Card key={participant.participantId} className="border border-border">
                    <CardContent className="p-4">
                      {/* Compact Overview Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          {getRankIcon(index + 1)}
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-foreground">
                              {participant.displayName}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {participant.sessionsPlayed} session{participant.sessionsPlayed !== 1 ? 's' : ''} played
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="text-2xl font-bold text-primary">
                              {participant.totalPoints}
                            </div>
                            <div className="text-xs text-muted-foreground">points</div>
                          </div>
                          
                          {participant.sessionBreakdown && participant.sessionBreakdown.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleParticipantDetails(participant.participantId)}
                              className="ml-4"
                              data-testid={`button-toggle-details-${participant.participantId}`}
                            >
                              {expandedParticipants.has(participant.participantId) ? (
                                <>
                                  <ChevronDown className="w-4 h-4 mr-2" />
                                  Hide Details
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="w-4 h-4 mr-2" />
                                  View Details
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Session Breakdown */}
                      {expandedParticipants.has(participant.participantId) && 
                       participant.sessionBreakdown && 
                       participant.sessionBreakdown.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
                            <Eye className="w-4 h-4 mr-2" />
                            Session Breakdown
                          </h4>
                          <div className="grid gap-2">
                            {participant.sessionBreakdown.map((session) => (
                              <div 
                                key={session.sessionId}
                                className="flex items-center justify-between p-3 bg-muted rounded-lg"
                              >
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {session.question}
                                  </p>
                                  <Badge variant={session.status === 'closed' ? 'default' : 'secondary'} className="text-xs mt-1">
                                    {session.status}
                                  </Badge>
                                </div>
                                <div className="text-right ml-4">
                                  <div className={`text-lg font-semibold ${
                                    session.points > 0 ? 'text-secondary' : 'text-muted-foreground'
                                  }`}>
                                    {session.points} pts
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}