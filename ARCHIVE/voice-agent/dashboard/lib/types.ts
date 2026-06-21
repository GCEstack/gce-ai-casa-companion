export type Device = {
  id: string;
  parent_id: string;
  device_type: string;
  serial_number: string;
  character_id?: string;
  mode_id?: string;
  battery?: number;
  fly_machine_id?: string;
  api_key?: string;
  last_seen?: string;
  is_active: boolean;
  created_at: string;
};

export type Parent = {
  id: string;
  email: string;
  consent_verified: boolean;
  consent_method?: string;
  consent_at?: string;
  stripe_customer_id?: string;
};

export type CharacterMode = {
  id: string;
  character_key: string;
  mode_key: string;
  name: string;
  prompt: string;
  voice_id?: string;
  ssml_template?: string;
  sort_order?: number;
  is_active: boolean;
};

export type Medallion = {
  id: string;
  parent_id: string;
  nfc_tag_id: string;
  character_id?: string;
  mode_id?: string;
  created_at: string;
  character_modes?: { name: string } | null;
};

export type ServerState = "idle" | "listening" | "thinking" | "speaking" | "unknown";
