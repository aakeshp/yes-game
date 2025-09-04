import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface Session {
  id: string;
  gameId: string;
  question: string;
  status: string;
  endsAt?: string;
}

interface Participant {
  id: string;
  displayName: string;
}

interface Submission {
  vote?: "YES" | "NO";
  guessYesCount?: number;
}

export default function LiveSession() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { isConnected, socket, joinSession, submitVote } = useWebSocket();
  
  const [sessionId, setSessionId] = useState<string>("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentSubmission, setCurrentSubmission] = useState<Submission>({});
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [vote, setVote] = useState<"YES" | "NO" | "">("");
  const [guess, setGuess] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasChangedSinceSubmit, setHasChangedSinceSubmit] = useState(false);

  // Extract session ID from URL
  useEffect(() => {
    const match = location.match(/\/session\/(.+)/);
    if (match) {
      setSessionId(match[1]);
    }
  }, [location]);

  // Join session when connected
  useEffect(() => {
    if (isConnected && sessionId) {
      const playerName = localStorage.getItem("playerName");
      const gameCode = new URLSearchParams(window.location.search).get("game") || "";
      const participantId = localStorage.getItem(`participantId_${gameCode}`);
      
      if (playerName) {
        joinSession(sessionId, participantId || undefined, playerName);
      }
    }
  }, [isConnected, sessionId, joinSession]);

  // WebSocket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleSessionJoined = (data: any) => {
      setParticipant(data.participant);
      setSession(data.session);
      setCurrentSubmission(data.currentSubmission || {});
      
      if (data.currentSubmission) {
        setVote(data.currentSubmission.vote || "");
        setGuess(data.currentSubmission.guessYesCount?.toString() || "");
        setHasSubmitted(true);
        setHasChangedSinceSubmit(false);
      }
      
      if (data.session.endsAt) {
        const remaining = Math.max(0, new Date(data.session.endsAt).getTime() - Date.now());
        setTimeRemaining(Math.floor(remaining / 1000));
      }
    };

    const handleSessionStarted = (data: any) => {
      setSession(data.session);
      setTimeRemaining(data.timeRemaining || 0);
    };

    const handleSessionTick = (data: any) => {
      setTimeRemaining(data.timeRemaining || 0);
    };

    const handleSessionResults = (data: any) => {
      navigate(`/results/${sessionId}`);
    };

    const handleSubmitted = (data: any) => {
      setCurrentSubmission(data.submission);
      setIsSubmitting(false);
      setHasSubmitted(true);
      setHasChangedSinceSubmit(false);
      toast({ title: "Success", description: "Your submission has been saved" });
    };

    const handleError = (data: any) => {
      setIsSubmitting(false);
      toast({ title: "Error", description: data.message || "Something went wrong", variant: "destructive" });
    };

    socket.on('session:joined', handleSessionJoined);
    socket.on('session:started', handleSessionStarted);
    socket.on('session:tick', handleSessionTick);
    socket.on('session:results', handleSessionResults);
    socket.on('session:submitted', handleSubmitted);
    socket.on('error', handleError);

    return () => {
      socket.off('session:joined', handleSessionJoined);
      socket.off('session:started', handleSessionStarted);
      socket.off('session:tick', handleSessionTick);
      socket.off('session:results', handleSessionResults);
      socket.off('session:submitted', handleSubmitted);
      socket.off('error', handleError);
    };
  }, [socket, sessionId, navigate, toast]);

  const handleVoteClick = (selectedVote: "YES" | "NO") => {
    const newVote = vote === selectedVote ? "" : selectedVote;
    setVote(newVote);
    if (hasSubmitted) {
      setHasChangedSinceSubmit(true);
    }
  };

  const handleSubmit = () => {
    if (session?.status !== 'live') {
      toast({ title: "Error", description: "Session is not live", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    submitVote(
      vote || undefined,
      guess ? parseInt(guess, 10) : undefined
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Connecting to game server...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session || !participant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Loading session...</p>
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
                <span>Live Session (Player)</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Player Info Bar */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-secondary rounded-full"></div>
                  <span className="font-medium text-foreground">
                    You are playing as: <span className="text-primary" data-testid="text-player-name">{participant.displayName}</span>
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} data-testid="button-leave">
                Leave Session
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Question Display */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4" data-testid="text-question">
                {session.question}
              </h2>
              
              {/* Timer Display */}
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-32 h-32 bg-primary rounded-full mb-4">
                  <span className="text-4xl font-bold text-primary-foreground font-mono" data-testid="text-timer">
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Time remaining</p>
              </div>

              {/* Voting Buttons */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                <Button
                  variant={vote === "YES" ? "default" : "outline"}
                  size="lg"
                  className={`h-32 text-lg font-bold transition-all hover:scale-105 ${
                    vote === "YES" ? "bg-secondary text-secondary-foreground shadow-lg" : ""
                  }`}
                  onClick={() => handleVoteClick("YES")}
                  disabled={session.status !== 'live'}
                  data-testid="button-vote-yes"
                >
                  <div className="flex flex-col items-center space-y-2">
                    <ThumbsUp size={48} />
                    <div>YES</div>
                    <div className="text-sm font-normal opacity-80">Click to vote yes</div>
                  </div>
                </Button>
                <Button
                  variant={vote === "NO" ? "default" : "outline"}
                  size="lg"
                  className={`h-32 text-lg font-bold transition-all hover:scale-105 ${
                    vote === "NO" ? "bg-destructive text-destructive-foreground shadow-lg" : ""
                  }`}
                  onClick={() => handleVoteClick("NO")}
                  disabled={session.status !== 'live'}
                  data-testid="button-vote-no"
                >
                  <div className="flex flex-col items-center space-y-2">
                    <ThumbsDown size={48} />
                    <div>NO</div>
                    <div className="text-sm font-normal opacity-80">Click to vote no</div>
                  </div>
                </Button>
              </div>

              {/* Guess Input */}
              <div className="max-w-md mx-auto">
                <Label htmlFor="guess-input" className="block text-sm font-medium text-foreground mb-2">
                  Guess the number of YES votes
                </Label>
                <div className="flex space-x-3">
                  <Input
                    id="guess-input"
                    type="number"
                    min="0"
                    placeholder="Enter your guess"
                    value={guess}
                    onChange={(e) => {
                      setGuess(e.target.value);
                      if (hasSubmitted) {
                        setHasChangedSinceSubmit(true);
                      }
                    }}
                    className="flex-1 text-center text-lg"
                    disabled={session.status !== 'live'}
                    data-testid="input-guess"
                  />
                  <Button
                    onClick={handleSubmit}
                    disabled={session.status !== 'live' || isSubmitting || (hasSubmitted && !hasChangedSinceSubmit)}
                    className={`${hasSubmitted && !hasChangedSinceSubmit ? 'bg-secondary text-secondary-foreground' : 'bg-accent text-accent-foreground hover:bg-accent/90'}`}
                    data-testid="button-submit"
                  >
                    {isSubmitting ? "Submitting..." : 
                     hasSubmitted && !hasChangedSinceSubmit ? "Submitted ✓" :
                     hasSubmitted && hasChangedSinceSubmit ? "Update Submission" :
                     "Submit"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {hasSubmitted && !hasChangedSinceSubmit 
                    ? "Submission saved! You can still change your vote/guess if needed."
                    : "You can update your vote and guess until the timer expires"
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Submission Status */}
        {(currentSubmission.vote || currentSubmission.guessYesCount !== undefined) && (
          <Card className="bg-muted border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-foreground">Your current submission:</span>
                  <div className="flex items-center space-x-2">
                    {currentSubmission.vote && (
                      <Badge 
                        variant={currentSubmission.vote === "YES" ? "secondary" : "destructive"}
                        data-testid="badge-current-vote"
                      >
                        {currentSubmission.vote}
                      </Badge>
                    )}
                    {currentSubmission.guessYesCount !== undefined && (
                      <span className="text-sm text-muted-foreground">
                        Guess: <span className="font-medium text-foreground" data-testid="text-current-guess">
                          {currentSubmission.guessYesCount}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  Last updated: {new Date().toLocaleTimeString()}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
