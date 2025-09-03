import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Users, GamepadIcon } from "lucide-react";

export default function AdminSetup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [adminNameInput, setAdminNameInput] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [gameName, setGameName] = useState("");
  const [showCreateGame, setShowCreateGame] = useState(false);

  const isAdminCreated = localStorage.getItem("adminId");
  const currentAdminName = localStorage.getItem("adminName");

  // Fetch existing games if admin is authenticated
  const { data: games } = useQuery<any[]>({
    queryKey: ["/api/admin/games"],
    enabled: !!isAdminCreated,
  });

  // If admin exists and has games, redirect to last game
  useEffect(() => {
    console.log("Admin setup redirect check:", { isAdminCreated, games, gamesLength: games?.length });
    if (isAdminCreated && games && Array.isArray(games) && games.length > 0) {
      const lastGameId = localStorage.getItem("lastGameId");
      console.log("Checking for existing game:", lastGameId);
      const gameExists = games.find((g: any) => g.id === lastGameId);
      if (gameExists) {
        console.log("Redirecting to existing game:", lastGameId);
        navigate(`/admin/games/${lastGameId}`);
      } else {
        // Use the most recent game
        console.log("Using most recent game:", games[0].id);
        localStorage.setItem("lastGameId", games[0].id);
        navigate(`/admin/games/${games[0].id}`);
      }
    }
  }, [isAdminCreated, games, navigate]);

  const registerAdminMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const response = await apiRequest("POST", "/api/admin/register", data);
      return response.json();
    },
    onSuccess: (admin) => {
      localStorage.setItem("adminId", admin.adminId);
      localStorage.setItem("adminName", admin.name);
      toast({ title: "Success", description: "Admin account created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create admin account", variant: "destructive" });
    }
  });

  const createGameMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("POST", "/api/games", data);
      return response.json();
    },
    onSuccess: (game) => {
      localStorage.setItem("lastGameId", game.gameId);
      toast({ title: "Success", description: "Game created successfully" });
      navigate(`/admin/games/${game.gameId}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create game", variant: "destructive" });
    }
  });

  const handleCreateAdmin = () => {
    if (!adminNameInput.trim()) {
      toast({ title: "Error", description: "Please enter your name", variant: "destructive" });
      return;
    }
    registerAdminMutation.mutate({
      name: adminNameInput.trim(),
      email: adminEmailInput.trim()
    });
  };

  const handleCreateGame = () => {
    if (!gameName.trim()) {
      toast({ title: "Error", description: "Please enter a game name", variant: "destructive" });
      return;
    }
    createGameMutation.mutate({
      name: gameName.trim()
    });
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
                <span>Admin Setup</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} data-testid="button-back-home">
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-4">Admin Setup</h2>
          <p className="text-muted-foreground">Set up your admin account and create your first game</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Step 1: Create Admin Account */}
          <Card className={`shadow-lg border border-border ${isAdminCreated ? 'opacity-75' : ''}`}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>Step 1: Create Admin Account</span>
                {isAdminCreated && <span className="text-sm bg-secondary text-secondary-foreground px-2 py-1 rounded">✓ Done</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAdminCreated ? (
                <>
                  <div>
                    <Label htmlFor="admin-name">Your Name *</Label>
                    <Input
                      id="admin-name"
                      type="text"
                      placeholder="Enter your name"
                      value={adminNameInput}
                      onChange={(e) => setAdminNameInput(e.target.value)}
                      className="mt-1"
                      data-testid="input-admin-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-email">Email (optional)</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={adminEmailInput}
                      onChange={(e) => setAdminEmailInput(e.target.value)}
                      className="mt-1"
                      data-testid="input-admin-email"
                    />
                  </div>
                  <Button 
                    onClick={handleCreateAdmin}
                    disabled={registerAdminMutation.isPending || !adminNameInput.trim()}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid="button-create-admin"
                  >
                    {registerAdminMutation.isPending ? "Creating..." : "Create Admin Account"}
                  </Button>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="w-8 h-8 text-secondary-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-1">Admin Account Ready</h3>
                  <p className="text-sm text-muted-foreground">Welcome, {currentAdminName}!</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Create First Game */}
          <Card className={`shadow-lg border border-border ${!isAdminCreated ? 'opacity-50' : ''}`}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <GamepadIcon className="w-5 h-5" />
                <span>Step 2: Create Your First Game</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdminCreated ? (
                <>
                  <div>
                    <Label htmlFor="game-name">Game Name *</Label>
                    <Input
                      id="game-name"
                      type="text"
                      placeholder="e.g., Team Meeting Questions, Friday Fun Quiz"
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                      className="mt-1"
                      data-testid="input-game-name"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Choose a descriptive name that participants will recognize
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium text-foreground mb-2">What happens next:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• A unique 6-digit join code will be generated</li>
                      <li>• You'll be taken to the admin console</li>
                      <li>• You can create sessions and invite participants</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={handleCreateGame}
                    disabled={createGameMutation.isPending || !gameName.trim()}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                    data-testid="button-create-game"
                  >
                    {createGameMutation.isPending ? "Creating Game..." : "Create Game & Continue"}
                  </Button>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                    <GamepadIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">Complete Step 1 first to unlock game creation</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Help Section */}
        <Card className="mt-8 bg-muted border border-border">
          <CardContent className="p-6">
            <h3 className="font-medium text-foreground mb-3">Need Help?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <h4 className="font-medium text-foreground mb-1">How it works:</h4>
                <ul className="space-y-1">
                  <li>• Create sessions with Yes/No questions</li>
                  <li>• Players vote and guess the number of Yes votes</li>
                  <li>• Points awarded for exact (5pts) or close (3pts) guesses</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-1">Anti-cheat features:</h4>
                <ul className="space-y-1">
                  <li>• No interim tallies shown during live sessions</li>
                  <li>• Results revealed only after timer expires</li>
                  <li>• Fair scoring for all participants</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}