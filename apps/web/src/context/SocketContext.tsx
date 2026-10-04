import { useLocation } from 'react-router-dom';
import { expireVendorSession, getVendorSessionVersion } from '../lib/vendorSession';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

import { API_ORIGIN } from '../lib/api';
import { ensureGuestToken } from '../lib/guest';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_ORIGIN || 'http://localhost:3001';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const vendorPage = /^\/(vendor|admin)(\/|$)/.test(pathname);
  const customerPage = /^\/(v|order|track)\//.test(pathname);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setSocket(null);
    setIsConnected(false);
    if (isLoading || (!vendorPage && !customerPage) || (vendorPage && !user)) return;
    let cancelled = false;
    let vendorSessionVersion = getVendorSessionVersion();
    const newSocket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      withCredentials: true,
      auth: (callback) => {
        // Called on every connection/reconnection: never reuse an old captured token.
        if (vendorPage) {
          vendorSessionVersion = getVendorSessionVersion();
          callback({});
        } else {
          ensureGuestToken().then((token) => {
            if (!cancelled) callback({ token });
          }).catch(() => {
            if (!cancelled) { setIsConnected(false); newSocket.disconnect(); }
          });
        }
      },
    });
    const authenticationFailed = () => {
      setIsConnected(false);
      newSocket.disconnect();
      if (vendorPage) expireVendorSession(vendorSessionVersion);
    };
    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('connect_error', (error) => {
      setIsConnected(false);
      if ((error as Error & { data?: { code?: string } }).data?.code === 'SOCKET_AUTH_ERROR') authenticationFailed();
    });
    newSocket.on('auth_error', authenticationFailed);
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
    newSocket.connect();

    return () => {
      cancelled = true;
      newSocket.disconnect();
    };
  }, [user, isLoading, vendorPage, customerPage]);

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
