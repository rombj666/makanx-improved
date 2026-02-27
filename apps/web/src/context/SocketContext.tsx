import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { Role } from '@makanx/shared';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

import { API_ORIGIN } from '../lib/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_ORIGIN || 'http://localhost:3001';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const guestId = localStorage.getItem('guestId') || crypto.randomUUID();
    if (!localStorage.getItem('guestId')) {
      localStorage.setItem('guestId', guestId);
    }

    if (!user && !guestId) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const newSocket = io(SOCKET_URL);

    newSocket.on('connect', async () => {
      setIsConnected(true);

      if (user) {
        newSocket.emit('join', localStorage.getItem('token'));
      } else {
        newSocket.emit('join', `user:${guestId}`);
      }

      if (user?.role === Role.VENDOR) {
        try {
      const res = await fetch(`${SOCKET_URL}/api/orders/vendor-orders`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await res.json();
      if (data.success && data.data.length > 0) {
        const vendorId = data.data[0].vendorId;
        newSocket.emit('join_vendor', vendorId);
      }
    } catch (e) {
      console.error("Vendor room join failed", e);
    }
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
