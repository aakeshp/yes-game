import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";

export interface PlayerUser {
  id: string;
  googleId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export function usePlayerAuth() {
  const { data: playerUser, isLoading } = useQuery<PlayerUser | null>({
    queryKey: ["/api/player/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/player/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/player/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me"] });
    },
  });

  const claimParticipants = async (items: { participantId: string; gameCode: string }[]) => {
    if (!playerUser || items.length === 0) return;
    try {
      await apiRequest("POST", "/api/player/claim-participants", items);
    } catch (_) {
      // Non-critical — best-effort linking
    }
  };

  return {
    playerUser: playerUser ?? null,
    isLoading,
    logout: () => logoutMutation.mutate(),
    isLoggingOut: logoutMutation.isPending,
    claimParticipants,
  };
}
