export interface Character {
  slug: string;
  name: string;
  italianMeaning: string;
  accentColor: string;
  category: 'animal' | 'fantasy' | 'person' | 'object';
  traits: string[];
  portrait: string;
  showcase: string;
  voiceIntro: string;
  idleVideo?: string;
  speakingVideo?: string;
  modes: {
    play: string[];
    learn: string[];
    support: string[];
  };
}

export interface CharacterFeature {
  name: string;
  description: string;
  triggers: string[];
  slashCommands: string[];
  behavior: string;
}

import type { ModeConfig } from '@/lib/casaCharacters';
export type { ModeConfig };

export type ConversationMode = 'turn-based' | 'free-flow';

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking';

export type AiMode =
  | 'default'
  | 'story'
  | 'math'
  | 'homework'
  | 'teaching'
  | 'calm'
  | 'creative'
  | 'debate';

export interface AppState {
  selectedCharacter: Character | null;
  activeMode: ModeConfig;
  connectionStatus: 'online' | 'offline';
  voiceEnabled: boolean;
  sessionCost: number;
  messageCount: number;
  isRecording: boolean;
  isSpeaking: boolean;
  micPermission: boolean;
  conversationMode: ConversationMode;
  wakeWordEnabled: boolean;
  bargeInEnabled: boolean;
  isWakeWordListening: boolean;
  isBargeInActive: boolean;
}

export type AppAction =
  | { type: 'SELECT_CHARACTER'; payload: Character }
  | { type: 'SET_MODE'; payload: ModeConfig }
  | { type: 'SET_CONNECTION_STATUS'; payload: 'online' | 'offline' }
  | { type: 'TOGGLE_VOICE' }
  | { type: 'INCREMENT_MESSAGES' }
  | { type: 'RESET_SESSION' }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_SPEAKING'; payload: boolean }
  | { type: 'SET_MIC_PERMISSION'; payload: boolean }
  | { type: 'SET_CONVERSATION_MODE'; payload: ConversationMode }
  | { type: 'TOGGLE_WAKE_WORD' }
  | { type: 'TOGGLE_BARGE_IN' }
  | { type: 'SET_WAKE_WORD_LISTENING'; payload: boolean }
  | { type: 'SET_BARGE_IN_ACTIVE'; payload: boolean };
