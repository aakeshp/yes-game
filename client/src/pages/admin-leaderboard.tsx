import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trophy, Medal, Award, ChevronDown, ChevronRight, Eye, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
      vote: "YES" | "NO" | null;
      guess: number | null;
      actualYesCount: number;
    }>;
  }>;
}

interface EditState {
  sessionId: string;
  participantId: string;
  participantName: string;
  question: string;
  vote: "YES" | "NO";
  guess: number;
}

export default function AdminLeaderboard() {
  const [location, navigate] = useLocation();
  const [gameId, setGameId] = useState<string>("");
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<EditState | null>(null);
  const { toast } = useToast();

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

  const editMutation = useMutation({
    mutationFn: async (data: { sessionId: string; participantId: string; vote: string; guessYesCount: number }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/sessions/${data.sessionId}/participants/${data.participantId}/submission`,
        { vote: data.vote, guessYesCount: data.guessYesCount }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games", gameId, "detailed-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "leaderboard"] });
      setEditState(null);
      toast({ title: "Submission updated", description: "Points have been recalculated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update submission.", variant: "destructive" });
    }
  });

  const handleSaveEdit = () => {
    if (!editState) return;
    editMutation.mutate({
      sessionId: editState.sessionId,
      participantId: editState.participantId,
      vote: editState.vote,
      guessYesCount: editState.guess,
    });
  };

  const handleBackToAdmin = () => {
    navigate(`/admin/games/${gameId}`);
  };

  const calculateRanks = (leaderboard: GameWithDetailedLeaderboard['leaderboard']) => {
    if (!leaderboard || leaderboard.length === 0) return [];
    
    const rankedEntries: Array<{entry: GameWithDetailedLeaderboard['leaderboard'][0], rank: number}> = [];
    let currentRank = 1;
    
    leaderboard.forEach((entry, index) => {
      if (index > 0 && entry.totalPoints < leaderboard[index - 1].totalPoints) {
        currentRank = index + 1;
      }
      rankedEntries.push({ entry, rank: currentRank });
    });
    
    return rankedEntries;
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
        return <Trophy className="w-6 h-6 text-muted-foreground" />;
      case 2:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 3:
        return <Award className="w-6 h-6 text-muted-foreground" />;
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
                {calculateRanks(gameData.leaderboard).map(({ entry: participant, rank }) => (
                  <Card key={participant.participantId} className="border border-border">
                    <CardContent className="p-4">
                      {/* Compact Overview Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          {getRankIcon(rank)}
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
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant={session.status === 'closed' ? 'default' : 'secondary'} className="text-xs">
                                      {session.status}
                                    </Badge>
                                    {session.vote && (
                                      <Badge variant={session.vote === "YES" ? "secondary" : "destructive"} className="text-xs">
                                        Voted: {session.vote}
                                      </Badge>
                                    )}
                                    {session.guess !== null && session.guess !== undefined ? (
                                      <Badge variant="outline" className="text-xs">
                                        Guessed: {session.guess}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs opacity-50">
                                        No guess
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-xs">
                                      Actual: {session.actualYesCount} Yes
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 ml-4">
                                  <div className="text-right">
                                    <div className={`text-lg font-semibold ${
                                      session.points > 0 ? 'text-primary' : 'text-muted-foreground'
                                    }`}>
                                      {session.points} pts
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditState({
                                      sessionId: session.sessionId,
                                      participantId: participant.participantId,
                                      participantName: participant.displayName,
                                      question: session.question,
                                      vote: session.vote ?? "YES",
                                      guess: session.guess ?? 0,
                                    })}
                                    data-testid={`button-edit-submission-${session.sessionId}-${participant.participantId}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
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

      {/* Edit Submission Dialog */}
      <Dialog open={!!editState} onOpenChange={(open) => { if (!open) setEditState(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Submission</DialogTitle>
          </DialogHeader>
          {editState && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Player</p>
                <p className="font-medium">{editState.participantName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Question</p>
                <p className="font-medium text-sm">{editState.question}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vote">Vote</Label>
                <Select
                  value={editState.vote}
                  onValueChange={(value: "YES" | "NO") => setEditState({ ...editState, vote: value })}
                >
                  <SelectTrigger id="edit-vote">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">YES</SelectItem>
                    <SelectItem value="NO">NO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-guess">Guess (number of YES votes)</Label>
                <Input
                  id="edit-guess"
                  type="number"
                  min={0}
                  value={editState.guess}
                  onChange={(e) => setEditState({ ...editState, guess: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
