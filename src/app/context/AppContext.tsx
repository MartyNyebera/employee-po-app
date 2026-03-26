// Global state management solution
import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Types
interface AppState {
  user: User | null;
  notifications: Notification[];
  drivers: Driver[];
  vehicles: Vehicle[];
  loading: boolean;
  error: string | null;
}

interface User {
  id: number;
  name: string;
  role: 'admin' | 'employee' | 'driver';
  isSuperAdmin?: boolean;
}

// Actions
type AppAction = 
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'UPDATE_DRIVERS'; payload: Driver[] };

// Reducer
const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] };
    case 'UPDATE_DRIVERS':
      return { ...state, drivers: action.payload };
    default:
      return state;
  }
};

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, {
    user: null,
    notifications: [],
    drivers: [],
    vehicles: [],
    loading: false,
    error: null,
  });

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// Hook
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};
