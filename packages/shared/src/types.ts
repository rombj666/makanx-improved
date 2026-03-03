export enum Role {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
  ORGANIZER = 'ORGANIZER'
}

export enum OrderStatus {
  PREPARING = 'PREPARING',
  READY = 'READY',
  COMPLETED = 'COMPLETED'
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
