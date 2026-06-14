import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { AppState, AppAction } from '@/types';
import { introductionMode } from '@/lib/modes';

const initialState: AppState = {
  selectedCharacter: null,
  activeMode: introductionMode,
  connectionStatus: 'offline',
  voiceEnabled: true,
  sessionCost: 0,
  messageCount: 0,
  isRecording: false,
  isSpeaking: false,
  micPermission: false,
  conversationMode: 'turn-based',
  wakeWordEnabled: false,
  bargeInEnabled: false,
  isWakeWordListening: false,
  isBargeInActive: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_CHARACTER':
      return { ...state, selectedCharacter: action.payload, activeMode: introductionMode };
    case 'SET_MODE':
      return { ...state, activeMode: action.payload };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'TOGGLE_VOICE':
      return { ...state, voiceEnabled: !state.voiceEnabled };
    case 'INCREMENT_MESSAGES':
      return { ...state, messageCount: state.messageCount + 1 };
    case 'RESET_SESSION':
      return { ...state, messageCount: 0, sessionCost: 0 };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload };
    case 'SET_SPEAKING':
      return { ...state, isSpeaking: action.payload };
    case 'SET_MIC_PERMISSION':
      return { ...state, micPermission: action.payload };
    case 'SET_CONVERSATION_MODE':
      return { ...state, conversationMode: action.payload };
    case 'TOGGLE_WAKE_WORD':
      return { ...state, wakeWordEnabled: !state.wakeWordEnabled };
    case 'TOGGLE_BARGE_IN':
      return { ...state, bargeInEnabled: !state.bargeInEnabled };
    case 'SET_WAKE_WORD_LISTENING':
      return { ...state, isWakeWordListening: action.payload };
    case 'SET_BARGE_IN_ACTIVE':
      return { ...state, isBargeInActive: action.payload };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
