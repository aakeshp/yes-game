export class GameSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private isConnecting: boolean = false;
  private isConnected: boolean = false;

  connect(): Promise<void> {
    // Prevent multiple concurrent connections
    if (this.isConnected || this.isConnecting) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.isConnecting = true;
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.isConnecting = false;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connection:ready') {
            return;
          }
          this.emit(data.type, data.payload || data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        this.isConnecting = false;
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.error('WebSocket URL was:', wsUrl);
        this.isConnected = false;
        this.isConnecting = false;
        reject(error);
      };
    });
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  send(type: string, payload?: any) {
    if (this.isReady()) {
      this.ws!.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('WebSocket not ready, message dropped:', { type, payload });
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
    this.isConnected = false;
    this.isConnecting = false;
    this.listeners.clear();
  }
}

export const gameSocket = new GameSocket();
