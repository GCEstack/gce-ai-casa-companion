import { allModes, type ModeConfig } from "@casa/characters";

export interface Mode {
  key: string;
  name: string;
  icon: string;
  prompt: string;
}

export const modes: Mode[] = allModes.map((m) => ({
  key: m.slug,
  name: m.label,
  icon: m.icon,
  prompt: m.prompt,
}));

export const modeMap = new Map(modes.map((m) => [m.key, m]));

export function getMode(key?: string): Mode | undefined {
  if (!key) return undefined;
  return modeMap.get(key);
}

export type { ModeConfig };
