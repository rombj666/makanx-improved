import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

import { API_ORIGIN } from '../lib/api';
import { getOrCreateGuestId } from '../lib/guest';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_ORIGIN || 'http://localhost:3001';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const guestId = getOrCreateGuestId();
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    if ((!user && !guestId) || (user && !token)) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: user && token ? { token } : { guestId },
    });

    newSocket.on('connect', async () => {
      setIsConnected(true);

      if (user && token) {
        newSocket.emit('join', token);
      } else {
        newSocket.emit('join', `user:${guestId}`);
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });
    let lastPlayed = 0;

    newSocket.on("order_created", () => {
      const now = Date.now();
      if (now - lastPlayed > 1500) {
        const audio = new Audio("/sounds/new-order.mp3");
        audio.volume = 0.8;
        audio.play().catch(() => {});
        lastPlayed = now;
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
