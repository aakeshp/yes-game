import { useEffect, useRef, useState } from "react";
import { gameSocket } from "@/lib/socket";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const connect = async () => {
      try {
        await gameSocket.connect();
        setIsConnected(gameSocket.isReady());
        setError(null);
      } catch (err) {
        setError('Failed to connect to game server');
        setIsConnected(false);
      }
    };

    // Update connection state when WebSocket state changes
    const updateConnectionState = () => {
      setIsConnected(gameSocket.isReady());
    };

    gameSocket.on('connection:ready', updateConnectionState);
    
    connect();

    return () => {
      gameSocket.off('connection:ready', updateConnectionState);
      gameSocket.disconnect();
    };
  }, []);

  const joinSession = (sessionId: string, participantId?: string, displayName?: string) => {
    gameSocket.send('session:join', { sessionId, participantId, displayName });
  };

  const submitVote = (vote?: string, guessYesCount?: number) => {
    gameSocket.send('session:submit', { vote, guessYesCount });
  };

  const monitorSession = (sessionId: string) => {
    gameSocket.send('admin:monitor', { sessionId });
  };

  return {
    isConnected,
    error,
    socket: gameSocket,
    joinSession,
    submitVote,
    monitorSession
  };
}
