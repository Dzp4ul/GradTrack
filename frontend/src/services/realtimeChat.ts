import { io, Socket } from 'socket.io-client';
import { REALTIME_URL } from '../config/api';

export type RealtimeChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export type SocketAck<T = unknown> = {
  success: boolean;
  error?: string;
} & T;

export function createRealtimeChatSocket(): Socket {
  return io(REALTIME_URL, {
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  });
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

