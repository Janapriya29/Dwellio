import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  MessageData,
} from '@dwellio/shared';
import { API_BASE_URL } from '../config/api';

type DwellioSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClientService {
  private socket: DwellioSocket | null = null;
  private currentToken: string | null = null;

  private resolveSocketUrl(): string {
    if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
      const parsed = new URL(API_BASE_URL);
      return parsed.origin;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return 'http://localhost:5000';
  }

  public connect(token: string): DwellioSocket {
    if (this.socket && this.socket.connected && this.currentToken === token) {
      return this.socket;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = token;
    const socketUrl = this.resolveSocketUrl();

    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as DwellioSocket;

    this.socket.on('connect', () => {
      // console.log('[Socket] Connected with id:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    return this.socket;
  }

  public getSocket(): DwellioSocket | null {
    return this.socket;
  }

  public joinBooking(bookingId: string): void {
    if (this.socket && bookingId) {
      this.socket.emit('join_booking', { bookingId });
    }
  }

  public leaveBooking(bookingId: string): void {
    if (this.socket && bookingId) {
      this.socket.emit('leave_booking', { bookingId });
    }
  }

  public sendMessage(bookingId: string, content: string): void {
    if (this.socket && bookingId && content) {
      this.socket.emit('send_message', { bookingId, content });
    }
  }

  public startTyping(bookingId: string): void {
    if (this.socket && bookingId) {
      this.socket.emit('typing_start', { bookingId });
    }
  }

  public stopTyping(bookingId: string): void {
    if (this.socket && bookingId) {
      this.socket.emit('typing_stop', { bookingId });
    }
  }

  public markRead(bookingId: string): void {
    if (this.socket && bookingId) {
      this.socket.emit('mark_read', { bookingId });
    }
  }

  public onNewMessage(callback: (message: MessageData) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('new_message', callback);
    return () => this.socket?.off('new_message', callback);
  }

  public onUserTyping(
    callback: (data: { bookingId: string; userId: string; role: string }) => void
  ): () => void {
    if (!this.socket) return () => {};
    this.socket.on('user_typing', callback);
    return () => this.socket?.off('user_typing', callback);
  }

  public onUserStoppedTyping(
    callback: (data: { bookingId: string; userId: string }) => void
  ): () => void {
    if (!this.socket) return () => {};
    this.socket.on('user_stopped_typing', callback);
    return () => this.socket?.off('user_stopped_typing', callback);
  }

  public onMessagesRead(
    callback: (data: { bookingId: string; readBy: string; readAt: string }) => void
  ): () => void {
    if (!this.socket) return () => {};
    this.socket.on('messages_read', callback);
    return () => this.socket?.off('messages_read', callback);
  }

  public onConversationLocked(
    callback: (data: { bookingId: string; reason: string }) => void
  ): () => void {
    if (!this.socket) return () => {};
    this.socket.on('conversation_locked', callback);
    return () => this.socket?.off('conversation_locked', callback);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.currentToken = null;
    }
  }
}

export const socketClientService = new SocketClientService();
