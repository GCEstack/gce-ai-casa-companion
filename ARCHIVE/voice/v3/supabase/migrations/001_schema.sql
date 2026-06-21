-- Casa Companion schema
-- COPPA design: no audio or transcript columns; sessions are ephemeral telemetry only.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Parents
CREATE TABLE IF NOT EXISTS parents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    consent_verified BOOLEAN DEFAULT FALSE,
    consent_method TEXT,
    consent_at TIMESTAMPTZ,
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    device_type TEXT NOT NULL,
    serial_number TEXT UNIQUE NOT NULL,
    character_id UUID,
    mode_id UUID,
    battery INTEGER DEFAULT 100,
    fly_machine_id TEXT,
    api_key TEXT UNIQUE NOT NULL,
    last_seen TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Character + mode configurations (130 seeded rows)
CREATE TABLE IF NOT EXISTS character_modes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_key TEXT NOT NULL,
    mode_key TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    voice_id TEXT NOT NULL,
    ssml_template TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(character_key, mode_key)
);

-- Ephemeral sessions (no audio/transcript storage)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    fly_machine_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT no_transcript CHECK (NOT (metadata ? 'transcript'))
);

-- NFC medallions
CREATE TABLE IF NOT EXISTS medallions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
    nfc_tag_id TEXT UNIQUE NOT NULL,
    character_id UUID,
    mode_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_parent ON devices(parent_id);
CREATE INDEX IF NOT EXISTS idx_devices_api_key ON devices(api_key);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_character_modes_keys ON character_modes(character_key, mode_key);
CREATE INDEX IF NOT EXISTS idx_medallions_tag ON medallions(nfc_tag_id);

-- Row Level Security
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE medallions ENABLE ROW LEVEL SECURITY;

-- Parents can read/update only their own row
CREATE POLICY parents_self_select ON parents
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY parents_self_update ON parents
    FOR UPDATE USING (auth.uid() = id);

-- Parents can manage their own devices
CREATE POLICY devices_parent_select ON devices
    FOR SELECT USING (auth.uid() = parent_id);

CREATE POLICY devices_parent_insert ON devices
    FOR INSERT WITH CHECK (auth.uid() = parent_id);

CREATE POLICY devices_parent_update ON devices
    FOR UPDATE USING (auth.uid() = parent_id);

CREATE POLICY devices_parent_delete ON devices
    FOR DELETE USING (auth.uid() = parent_id);

-- Sessions are visible to the device owner but contain no transcript/audio
CREATE POLICY sessions_parent_select ON sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM devices WHERE devices.id = sessions.device_id AND devices.parent_id = auth.uid()
        )
    );

-- Character modes are readable to authenticated users
CREATE POLICY character_modes_public_select ON character_modes
    FOR SELECT USING (is_active = TRUE);

-- Medallions owned by the parent
CREATE POLICY medallions_parent_select ON medallions
    FOR SELECT USING (auth.uid() = parent_id);

CREATE POLICY medallions_parent_insert ON medallions
    FOR INSERT WITH CHECK (auth.uid() = parent_id);

CREATE POLICY medallions_parent_update ON medallions
    FOR UPDATE USING (auth.uid() = parent_id);

CREATE POLICY medallions_parent_delete ON medallions
    FOR DELETE USING (auth.uid() = parent_id);

-- Auto-update parents.updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_parents_updated_at ON parents;
CREATE TRIGGER update_parents_updated_at
    BEFORE UPDATE ON parents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
