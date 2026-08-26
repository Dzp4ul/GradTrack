import { io, Socket } from 'socket.io-client';
import { API_ENDPOINTS, REALTIME_URL } from '../config/api';

export type RealtimeChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export type SocketAck<T = unknown> = {
  success: boolean;
  error?: string;
} & T;

export async function fetchRealtimeChatToken(): Promise<string> {
  const response = await fetch(API_ENDPOINTS.GRADUATE_AUTH.REALTIME_TOKEN, {
    method: 'GET',
    credentials: 'include',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data.success === false || typeof data.token !== 'string' || data.token.trim() === '') {
    throw new Error(data.error || 'Unable to prepare realtime connection');
  }

  return data.token;
}

export function createRealtimeChatSocket(token?: string): Socket {
  return io(REALTIME_URL, {
    autoConnect: false,
    auth: token ? { token } : undefined,
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
