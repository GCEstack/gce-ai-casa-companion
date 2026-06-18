/**
 * Casa Companion JSON message protocol types.
 *
 * Matches the firmware protocol defined in firmware/main/common.h
 */

export type CasaState = 'online' | 'offline' | 'listening' | 'speaking';

export interface VoiceStreamMessage {
  type: 'voice_stream';
  data: string; // base64 16kHz 16-bit mono PCM
  character: string;
}

export interface StatusMessage {
  type: 'status';
  state: CasaState;
  battery?: number;
  character?: string;
  mode?: string;
  mv?: number;
}

export interface ModeChangeMessage {
  type: 'mode_change';
  mode: string;
  character?: string;
}

export interface VoiceInputMessage {
  type: 'voice_input';
  data: string; // base64 16kHz 16-bit mono PCM
}

export interface ModeSelectMessage {
  type: 'mode_select';
  mode: string;
  character: string;
}

export interface ConnectMessage {
  type: 'connect';
  character: string;
}

export interface CommandMessage {
  type: 'command';
  command: 'sleep' | 'kill' | 'timeout';
}

export type CasaMessage =
  | VoiceStreamMessage
  | StatusMessage
  | ModeChangeMessage
  | VoiceInputMessage
  | ModeSelectMessage
  | ConnectMessage
  | CommandMessage;

export function encodeVoiceInput(base64Pcm: string): VoiceInputMessage {
  return { type: 'voice_input', data: base64Pcm };
}

export function encodeModeSelect(mode: string, character: string): ModeSelectMessage {
  return { type: 'mode_select', mode, character };
}

export function encodeConnect(character: string): ConnectMessage {
  return { type: 'connect', character };
}
