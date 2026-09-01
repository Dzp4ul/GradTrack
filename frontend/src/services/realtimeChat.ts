import { io, Socket } from 'socket.io-client';
import { REALTIME_URL } from '../config/api';

export type RealtimeChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export type SocketAck<T = unknown> = {
  success: boolean;
  error?: string;
} & T;

let realtimeChatSocket: Socket | null = null;

export function getRealtimeChatSocket(): Socket {
  if (realtimeChatSocket) return realtimeChatSocket;

  realtimeChatSocket = io(REALTIME_URL, {
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    // Allow the PHP session-backed authentication middleware to complete
    // during a busy full-page refresh before Socket.IO retries the handshake.
    timeout: 15000,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    upgrade: true,
    rememberUpgrade: true,
  });

  return realtimeChatSocket;
}

export function destroyRealtimeChatSocket(socket?: Socket | null): void {
  if (!realtimeChatSocket || (socket && socket !== realtimeChatSocket)) return;
  realtimeChatSocket.disconnect();
  realtimeChatSocket = null;
}

export async function notifyRealtimeChatLogout(): Promise<void> {
  const socket = realtimeChatSocket;
  if (!socket) return;

  try {
    if (socket.connected) {
      await emitWithAck(socket, 'session:logout', {}, 1500);
    }
  } finally {
    destroyRealtimeChatSocket(socket);
  }
}

export function emitWithAck<T = unknown>(
  socket: Socket,
  eventName: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error: Error | null, response: SocketAck<T>) => {
      if (error) {
        resolve({ success: false, error: 'Realtime server did not respond' } as SocketAck<T>);
        return;
      }

      resolve(response || ({ success: false, error: 'Realtime server returned an empty response' } as SocketAck<T>));
    });
  });
}

