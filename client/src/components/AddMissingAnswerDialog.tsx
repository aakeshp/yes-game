import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ClosedSession {
  id: string;
  question: string;
  yesCount: number;
}

interface PlayerOption {
  id: string;
  displayName: string;
}

interface Props {
  gameId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // For each signed-in player already on this game's leaderboard, the questions they have answered
  answeredByPlayer: Map<string, Set<string>>;
}

export default function AddMissingAnswerDialog({ gameId, open, onOpenChange, answeredByPlayer }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [player, setPlayer] = useState<PlayerOption | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [vote, setVote] = useState<"YES" | "NO" | "">("");
  const [guess, setGuess] = useState("");

  // Reset the form each time it opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setPlayer(null);
      setSessionId("");
      setVote("");
      setGuess("");
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: sessions } = useQuery<ClosedSession[]>({
    queryKey: ["/api/admin/games", gameId, "closed-sessions"],
    enabled: open && !!gameId,
    refetchOnMount: "always",
  });

  const { data: players, isFetching: searching } = useQuery<PlayerOption[]>({
    queryKey: ["/api/admin/games", gameId, "player-search", debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/admin/games/${gameId}/player-search?q=${encodeURIComponent(debouncedSearch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open && !player && debouncedSearch.length >= 2,
  });

  const selectedSession = sessions?.find((s) => s.id === sessionId);
  const alreadyAnswered = !!(player && sessionId && answeredByPlayer.get(player.id)?.has(sessionId));
  const guessNumber = guess === "" ? NaN : Number(guess);
  const guessValid = Number.isInteger(guessNumber) && guessNumber >= 0;
  const canSave = !!player && !!selectedSession && !!vote && guessValid && !alreadyAnswered;

  const addMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/sessions/${sessionId}/submissions`, {
        playerUserId: player!.id,
        vote,
        guessYesCount: guessNumber,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games", gameId, "detailed-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games", gameId, "closed-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "leaderboard"] });
      toast({ title: "Answer added", description: `${player!.displayName} is now on the leaderboard and points have been recalculated.` });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "Failed to add the answer.";
      try {
        const match = error?.message?.match(/^\d+: ([\s\S]*)/);
        if (match) description = JSON.parse(match[1]).error || description;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add missing answer</DialogTitle>
          <DialogDescription>
            For a player whose answer didn't get recorded. They'll be added to this game's leaderboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player */}
          <div className="space-y-2">
            <Label htmlFor="backfill-player">Player</Label>
            {player ? (
              <div className="flex items-center justify-between rounded-md border border-border p-2">
                <span className="font-medium">{player.displayName}</span>
                <Button variant="ghost" size="sm" onClick={() => setPlayer(null)}>Change</Button>
              </div>
            ) : (
              <>
                <Input
                  id="backfill-player"
                  placeholder="Type at least 2 letters of their name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                  aria-describedby="backfill-player-results"
                />
                <div id="backfill-player-results" aria-live="polite">
                  {debouncedSearch.length >= 2 && !searching && players?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No signed-in players match. They need to have signed in to the game at least once.</p>
                  )}
                  {players && players.length > 0 && (
                    <ul className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border" aria-label="Matching players">
                      {players.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setPlayer(p)}
                          >
                            {p.displayName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Question */}
          <div className="space-y-2">
            <Label htmlFor="backfill-question">Question</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger id="backfill-question">
                <SelectValue placeholder={sessions && sessions.length === 0 ? "No finished questions yet" : "Choose a finished question"} />
              </SelectTrigger>
              <SelectContent>
                {sessions?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.question}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {alreadyAnswered && (
              <p className="text-sm text-destructive" role="alert">
                {player!.displayName} already has an answer for this question. Edit it from their row instead.
              </p>
            )}
          </div>

          {/* Vote */}
          <div className="space-y-2">
            <Label htmlFor="backfill-vote">Vote</Label>
            <Select value={vote} onValueChange={(v: "YES" | "NO") => setVote(v)}>
              <SelectTrigger id="backfill-vote">
                <SelectValue placeholder="Choose Yes or No" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YES">YES</SelectItem>
                <SelectItem value="NO">NO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Guess */}
          <div className="space-y-2">
            <Label htmlFor="backfill-guess">Guess (number of YES votes)</Label>
            <Input
              id="backfill-guess"
              type="number"
              min={0}
              inputMode="numeric"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
            />
          </div>

          {/* Impact warning */}
          {selectedSession && vote === "YES" && !alreadyAnswered && (
            <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground" role="status">
              This changes the Yes count for this question from {selectedSession.yesCount} to {selectedSession.yesCount + 1} and
              recalculates everyone's points for it, so some other players' scores may change.
            </p>
          )}
          {selectedSession && vote === "NO" && !alreadyAnswered && (
            <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">
              The Yes count stays at {selectedSession.yesCount}, so other players' scores won't change.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!canSave || addMutation.isPending}>
            {addMutation.isPending ? "Adding..." : "Add answer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
