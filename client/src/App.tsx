import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import GameLobby from "@/pages/game-lobby";
import LiveSession from "@/pages/live-session";
import Results from "@/pages/results";
import AdminConsole from "@/pages/admin-console";
import AdminLiveView from "@/pages/admin-live-view";
import AdminLeaderboard from "@/pages/admin-leaderboard";
import AdminLogin from "@/pages/admin-login";
import AdminLoginFailed from "@/pages/admin-login-failed";

function Router() {
  return (
    <Switch>
      <Route path="/" component={GameLobby} />
      <Route path="/play/:gameCode" component={GameLobby} />
      <Route path="/session/:sessionId" component={LiveSession} />
      <Route path="/results/:sessionId" component={Results} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/login-failed" component={AdminLoginFailed} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/console" component={AdminConsole} />
      <Route path="/admin/games/:gameId" component={AdminConsole} />
      <Route path="/admin/games/:gameId/leaderboard" component={AdminLeaderboard} />
      <Route path="/admin/sessions/:sessionId" component={AdminLiveView} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
