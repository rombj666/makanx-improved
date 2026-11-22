export enum Role {
  VENDOR = 'VENDOR'
}

export enum OrderStatus {
  PREPARING = 'PREPARING',
  READY = 'READY',
  CANCELLED = 'CANCELLED'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
