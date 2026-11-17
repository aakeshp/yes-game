import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface RecentGame {
  gameId: string;
  name: string;
  status: string;
  totalPoints: number;
  sessionsPlayed: number;
  rank: number;
  playerCount: number;
  lastPlayedAt: string | null;
}

interface LeaderboardEntry {
  participantId: string;
  playerUserId?: string | null;
  displayName: string;
  totalPoints: number;
  sessionsPlayed: number;
}

const MAX_GAMES = 3;

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Competition ranking, matching the main lobby leaderboard: ties share a rank
const withRanks = (entries: LeaderboardEntry[]) => {
  let rank = 1;
  return entries.map((entry, index) => {
    if (index > 0 && entry.totalPoints < entries[index - 1].totalPoints) rank = index + 1;
    return { entry, rank };
  });
};

function GameLeaderboard({ gameId, playerUserId }: { gameId: string; playerUserId: string }) {
  const { data, isLoading, isError } = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["/api/games", gameId, "leaderboard"],
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading leaderboard...</p>;
  if (isError || !data) return <p className="p-4 text-sm text-muted-foreground">Couldn't load this leaderboard.</p>;
  if (data.leaderboard.length === 0) return <p className="p-4 text-sm text-muted-foreground">No results yet.</p>;

  return (
    <ol className="divide-y divide-border max-h-80 overflow-y-auto" aria-label="Final leaderboard">
      {withRanks(data.leaderboard).map(({ entry, rank }) => {
        const isMe = entry.playerUserId === playerUserId;
        return (
          <li
            key={entry.participantId}
            className={`flex items-center justify-between gap-3 px-4 py-2 ${isMe ? "bg-primary/10 border-l-4 border-primary" : ""}`}
          >
            <span className="w-10 text-sm font-semibold text-muted-foreground">#{rank}</span>
            <span className={`flex-1 font-medium ${isMe ? "text-primary" : "text-foreground"}`}>
              {entry.displayName}
              {isMe && <span className="ml-2 text-xs font-normal">(you)</span>}
            </span>
            <span className="font-semibold text-foreground">
              {entry.totalPoints} <span className="text-xs font-normal text-muted-foreground">pts</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function PreviousGames({ currentGameId, playerUserId }: { currentGameId: string | null; playerUserId: string }) {
  const [openGameId, setOpenGameId] = useState<string | null>(null);

  const { data: recentGames } = useQuery<RecentGame[]>({
    queryKey: ["/api/player/recent-games"],
    // Always refetch when the lobby opens so it reflects the signed-in player and latest results
    refetchOnMount: "always",
  });

  // The game the player is in already has its leaderboard on the page
  const games = (recentGames || []).filter((g) => g.gameId !== currentGameId).slice(0, MAX_GAMES);
  if (games.length === 0) return null;

  return (
    <section className="mt-8 border-t border-border pt-8" aria-labelledby="previous-games-heading">
      <h3 id="previous-games-heading" className="text-lg font-semibold text-foreground mb-4">
        Your previous games
      </h3>
      <ul className="space-y-3">
        {games.map((game) => {
          const isOpen = openGameId === game.gameId;
          const panelId = `previous-game-${game.gameId}`;
          return (
            <li key={game.gameId} className="rounded-lg border border-border bg-muted/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                    {game.name}
                    {game.status === "archived" && <Badge variant="outline">Ended</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You finished {ordinal(game.rank)} of {game.playerCount} · {game.totalPoints} point{game.totalPoints !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenGameId(isOpen ? null : game.gameId)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  data-testid={`button-previous-game-${game.gameId}`}
                >
                  {isOpen ? "Hide leaderboard" : "View leaderboard"}
                  {isOpen ? <ChevronUp className="w-4 h-4 ml-1" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 ml-1" aria-hidden="true" />}
                </Button>
              </div>
              {isOpen && (
                <div id={panelId} className="border-t border-border bg-card rounded-b-lg">
                  <GameLeaderboard gameId={game.gameId} playerUserId={playerUserId} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
