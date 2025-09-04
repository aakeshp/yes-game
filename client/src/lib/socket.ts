export class GameSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  // Session recovery state
  private lastSessionId: string | null = null;
  private lastParticipantId: string | null = null;
  private lastDisplayName: string | null = null;
  private isAdmin: boolean = false;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        const wasReconnecting = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        
        // Auto-rejoin session after reconnection
        if (wasReconnecting) {
          this.recoverSession();
        }
        
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connection:ready') {
            // Connection established successfully
            return;
          }
          this.emit(data.type, data.payload || data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  send(type: string, payload?: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
      
      // Store session info for recovery
      if (type === 'session:join' && payload) {
        this.lastSessionId = payload.sessionId;
        this.lastParticipantId = payload.participantId;
        this.lastDisplayName = payload.displayName;
        this.isAdmin = false;
      } else if (type === 'admin:join' && payload) {
        this.lastSessionId = payload.sessionId;
        this.isAdmin = true;
      }
    }
  }

  private recoverSession() {
    console.log('Session recovery triggered:', {
      lastSessionId: this.lastSessionId,
      isAdmin: this.isAdmin,
      hasParticipantData: !!(this.lastParticipantId || this.lastDisplayName)
    });
    
    if (this.lastSessionId) {
      setTimeout(() => {
        if (this.isAdmin) {
          console.log('Auto-recovering admin session');
          this.send('admin:join', { sessionId: this.lastSessionId });
        } else if (this.lastSessionId && (this.lastParticipantId || this.lastDisplayName)) {
          console.log('Auto-recovering participant session');
          this.send('session:join', { 
            sessionId: this.lastSessionId, 
            participantId: this.lastParticipantId,
            displayName: this.lastDisplayName
          });
        }
      }, 100); // Small delay to ensure connection is ready
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
    // Don't clear session state - keep it for potential reconnection
  }

  clearSession() {
    // Call this when truly leaving a session (not just disconnecting)
    this.lastSessionId = null;
    this.lastParticipantId = null;
    this.lastDisplayName = null;
    this.isAdmin = false;
  }
}

export const gameSocket = new GameSocket();
