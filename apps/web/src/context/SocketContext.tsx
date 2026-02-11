import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { Role } from '@makanx/shared';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const newSocket = io(SOCKET_URL);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Socket connected');
      
      // Join user room
      newSocket.emit('join', localStorage.getItem('token'));
      
      // If vendor, we might want to join specific vendor room too if not handled by backend user room logic
      // Backend currently joins 'user:{userId}'. 
      // Backend also listens for 'join_vendor'
      if (user.role === Role.VENDOR) {
         // Ideally we need vendorId. For now, we rely on backend finding it or 
         // we pass it if we have it in user object. 
         // Let's assume we need to fetch profile to get vendorId or user context has it?
         // Our User type in frontend AuthContext doesn't have vendorId.
         // Backend OrderService emits to 'vendor:{vendorId}'.
         // We need to know our vendorId to join. 
         // Hack: Backend 'join' listener could look up vendorId and join that room too.
         // Let's update backend socket logic if needed, but for now let's assume backend handles it 
         // OR we fetch /auth/me returns vendorProfile.id
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
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
