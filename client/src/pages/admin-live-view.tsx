import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Monitor, Users, Clock, Eye } from "lucide-react";

interface Session {
  id: string;
  gameId: string;
  question: string;
  status: string;
  endsAt?: string;
}

interface SessionData {
  id: string;
  gameId: string;
  question: string;
  status: string;
  endsAt?: string;
}

export default function AdminLiveView() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { isConnected, socket } = useWebSocket();
  
  const [sessionId, setSessionId] = useState<string>("");
  const [session, setSession] = useState<Session | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [submissionCount, setSubmissionCount] = useState<number>(0);

  // Extract session ID from URL
  useEffect(() => {
    const match = location.match(/\/admin\/sessions\/(.+)/);
    if (match) {
      setSessionId(match[1]);
    }
  }, [location]);

  const { data: sessionData } = useQuery<SessionData>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  // Periodic polling for session stats as WebSocket fallback
  const { data: sessionStats } = useQuery<{participantCount: number; submissionCount: number; status: string}>({
    queryKey: ["/api/sessions", sessionId, "stats"],
    enabled: !!sessionId && session?.status === 'live',
    refetchInterval: 3000, // Poll every 3 seconds while session is live
  });

  // Admin monitoring view - uses API data and listens for real-time updates
  // No session joining needed since this is observation-only

  // Clean up when leaving the page
  useEffect(() => {
    return () => {
      // No cleanup needed - connection handled by useWebSocket hook
    };
  }, []);

  // WebSocket event listeners for real-time updates (observation only)
  useEffect(() => {
    if (!socket || !sessionId) return;

    const handleSessionTick = (data: any) => {
      // Only update timer for live sessions to avoid conflicts
      if (session?.status === 'live') {
        setTimeRemaining(data.timeRemaining || 0);
      }
    };

    const handleParticipantUpdate = (data: any) => {
      setParticipantCount(data.participantCount || 0);
    };

    const handleSessionResults = (data: any) => {
      toast({ 
        title: "Results Ready!", 
        description: "Session results have been calculated and are now available",
        variant: "default"
      });
      // Don't auto-navigate - let admin choose when to view results
    };

    const handleError = (data: any) => {
      toast({ title: "Error", description: data.message || "Something went wrong", variant: "destructive" });
    };

    // Listen for session-wide events without joining as admin
    socket.on('session:tick', handleSessionTick);
    socket.on('session:participant_update', handleParticipantUpdate);
    socket.on('session:results', handleSessionResults);
    socket.on('error', handleError);

    return () => {
      socket.off('session:tick', handleSessionTick);
      socket.off('session:participant_update', handleParticipantUpdate);
      socket.off('session:results', handleSessionResults);
      socket.off('error', handleError);
    };
  }, [socket, sessionId, navigate, toast]);

  // Initialize from API data
  useEffect(() => {
    if (sessionData) {
      setSession(sessionData as Session);
      if (sessionData.endsAt && sessionData.status === 'live') {
        // Only calculate remaining time for live sessions
        const remaining = Math.max(0, new Date(sessionData.endsAt).getTime() - Date.now());
        setTimeRemaining(Math.floor(remaining / 1000));
      } else if (sessionData.status !== 'live') {
        // Clear timer for non-live sessions
        setTimeRemaining(0);
      }
    }
  }, [sessionData]);

  // Update stats from API polling (fallback for WebSocket)
  useEffect(() => {
    if (sessionStats) {
      setParticipantCount(sessionStats.participantCount);
      setSubmissionCount(sessionStats.submissionCount);
      
      // Update session status if it changed
      if (session && sessionStats.status !== session.status) {
        setSession({ ...session, status: sessionStats.status });
        
        // Clear timer when session ends
        if (sessionStats.status !== 'live') {
          setTimeRemaining(0);
        }
      }
    }
  }, [sessionStats, session]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSwitchToPlayerView = () => {
    if (session) {
      navigate(`/session/${session.id}`);
    }
  };

  const handleShowResults = () => {
    navigate(`/results/${sessionId}`);
  };

  const handleBackToAdmin = () => {
    // Try multiple fallback options for robust navigation
    if (session?.gameId) {
      navigate(`/admin/games/${session.gameId}`);
    } else if (sessionData?.gameId) {
      navigate(`/admin/games/${sessionData.gameId}`);
    } else {
      // Fallback to admin console if we can't determine the game ID
      navigate('/admin/console');
      toast({
        title: "Navigation Issue",
        description: "Returned to admin console due to lost game context",
        variant: "default"
      });
    }
  };

  const handleEndSession = () => {
    if (!sessionId) return;
    
    // Make API call to end the session early
    fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' })
      .then(response => {
        if (response.ok) {
          toast({
            title: "Session Ended",
            description: "Session has been ended early. Results will be available shortly.",
            variant: "default"
          });
          // Refresh session data to show updated status
          queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
          // Stay on admin view instead of redirecting - results will be available soon
        } else {
          throw new Error('Failed to end session');
        }
      })
      .catch(error => {
        toast({
          title: "Error",
          description: "Failed to end session",
          variant: "destructive"
        });
      });
  };

  if (!isConnected && !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Connecting to session...</p>
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
                <span>Live Session (Admin View)</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToAdmin}
              data-testid="button-back-admin"
            >
              Back to Admin Console
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Status Bar */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
                  <span className="font-medium text-foreground">Admin View — No interim tallies</span>
                </div>
              </div>
              <Button 
                onClick={handleSwitchToPlayerView}
                disabled={session.status !== 'live'}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-switch-player"
              >
                <Eye className="w-4 h-4 mr-2" />
                {session.status === 'live' ? 'Switch to Player View' : 'Session Ended'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Question & Timer Display */}
        <Card className="shadow-lg border border-border mb-6">
          <CardContent className="p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-6" data-testid="text-session-question">
                {session.question}
              </h2>
              
              {/* Timer Display */}
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-32 h-32 bg-accent rounded-full mb-4">
                  <span className="text-4xl font-bold text-accent-foreground font-mono" data-testid="text-admin-timer">
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Time remaining</p>
              </div>

              {/* Status Info */}
              <div className="bg-muted rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <Users className="w-6 h-6 text-primary mr-2" />
                      <div className="text-2xl font-bold text-primary" data-testid="text-participant-count">
                        {participantCount}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">Participants Joined</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <Monitor className="w-6 h-6 text-primary mr-2" />
                      <div className="text-2xl font-bold text-primary" data-testid="text-submission-count">
                        {submissionCount}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">Submissions Received</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <Clock className="w-6 h-6 text-accent mr-2" />
                      <Badge variant="destructive" className="text-lg px-3 py-1">
                        {session.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">Session Status</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls Section */}
        <Card className="shadow-lg border border-border mb-6">
          <CardHeader>
            <CardTitle>Admin Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center justify-center space-x-4">
                {session.status === 'live' ? (
                  <>
                    <Button 
                      variant="destructive" 
                      onClick={handleEndSession}
                      data-testid="button-end-session"
                    >
                      End Session Early
                    </Button>
                    <span className="text-muted-foreground">⚠️ Session is live - end early if needed</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">🔒 Controls disabled while session is live</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Post-Session Actions */}
        <Card className="shadow-lg border border-border">
          <CardHeader>
            <CardTitle>After Session Ends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button
                onClick={handleShowResults}
                disabled={session.status === 'live'}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-show-results"
              >
                📊 Show Results
              </Button>
              <Button 
                variant="outline"
                disabled={session.status === 'live'}
                className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-create-next"
              >
                📋 Create Next Session
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-3 text-center">
              {session.status === 'live' 
                ? "These actions will be available when the timer expires" 
                : "Session has ended - actions are now available"
              }
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
