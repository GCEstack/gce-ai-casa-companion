"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import ConsentForm from "@/components/ConsentForm";
import { Activity, Battery, Power, Plus, RefreshCw } from "lucide-react";
import type { User, Session } from "@supabase/supabase-js";

type Device = {
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

type Parent = {
  id: string;
  email: string;
  consent_verified: boolean;
  consent_method?: string;
  consent_at?: string;
  stripe_customer_id?: string;
};

type CharacterMode = {
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

type Medallion = {
  id: string;
  parent_id: string;
  nfc_tag_id: string;
  character_id?: string;
  mode_id?: string;
  created_at: string;
  character_modes?: { name: string } | null;
};

type ServerState = "idle" | "listening" | "thinking" | "speaking" | unknown;

interface DashboardClientProps {
  voiceServerUrl: string | null;
}

export default function DashboardClient({ voiceServerUrl }: DashboardClientProps) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [medallions, setMedallions] = useState<Medallion[]>([]);
  const [characterModes, setCharacterModes] = useState<CharacterMode[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");
  const [serverState, setServerState] = useState<ServerState>("idle");
  const [battery, setBattery] = useState<number | null>(null);
  const [killLoading, setKillLoading] = useState(false);
  const [killMessage, setKillMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [serialNumber, setSerialNumber] = useState("");
  const [deviceType, setDeviceType] = useState("companion");
  const [deviceFormLoading, setDeviceFormLoading] = useState(false);

  const [nfcTagId, setNfcTagId] = useState("");
  const [medallionCharacterId, setMedallionCharacterId] = useState("");
  const [medallionModeId, setMedallionModeId] = useState("");
  const [medallionFormLoading, setMedallionFormLoading] = useState(false);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !currentSession) {
        setError("Not authenticated. Redirecting to login...");
        window.location.href = "/login";
        return;
      }

      setSession(currentSession);
      setUser(currentSession.user);

      const [parentRes, devicesRes, medallionsRes, modesRes] = await Promise.all(
        [
          fetch("/api/parent"),
          fetch("/api/devices"),
          fetch("/api/medallions"),
          fetch("/api/character-modes"),
        ]
      );

      if (parentRes.ok) {
        const parentData = await parentRes.json();
        setParent(parentData.parent);
      } else {
        const err = await parentRes.json();
        console.error("Failed to load parent:", err);
      }

      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDevices(devicesData.devices ?? []);
      } else {
        const err = await devicesRes.json();
        setError(err.error || "Failed to load devices");
      }

      if (medallionsRes.ok) {
        const medallionsData = await medallionsRes.json();
        setMedallions(medallionsData.medallions ?? []);
      }

      if (modesRes.ok) {
        const modesData = await modesRes.json();
        setCharacterModes(modesData.characterModes ?? []);
      }
    } catch (err) {
      setError("Network error while loading dashboard.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedDeviceId || !session) {
      setConnectionStatus("disconnected");
      setServerState("idle");
      setBattery(null);
      return;
    }

    if (!voiceServerUrl) {
      setConnectionStatus("not configured");
      return;
    }

    setConnectionStatus("connecting");
    const url = `${voiceServerUrl}/events/${selectedDeviceId}?token=${session.access_token}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setConnectionStatus("connected");
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof data.state === "string") {
          setServerState(data.state);
        }
        if (typeof data.battery === "number") {
          setBattery(data.battery);
        }
      } catch {
        // Ignore malformed events.
      }
    };

    es.onerror = () => {
      setConnectionStatus("error");
    };

    return () => {
      es.close();
      setConnectionStatus("disconnected");
    };
  }, [selectedDeviceId, session, voiceServerUrl]);

  async function handleRegisterDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!serialNumber.trim()) return;

    setDeviceFormLoading(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_number: serialNumber.trim(),
          device_type: deviceType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to register device");
      } else {
        setDevices((prev) => [data.device, ...prev]);
        setSerialNumber("");
      }
    } catch {
      setError("Network error while registering device");
    } finally {
      setDeviceFormLoading(false);
    }
  }

  async function handleRegisterMedallion(e: React.FormEvent) {
    e.preventDefault();
    if (!nfcTagId.trim()) return;

    setMedallionFormLoading(true);
    try {
      const res = await fetch("/api/medallions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nfc_tag_id: nfcTagId.trim(),
          character_id: medallionCharacterId || null,
          mode_id: medallionModeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to register medallion");
      } else {
        setMedallions((prev) => [data.medallion, ...prev]);
        setNfcTagId("");
        setMedallionCharacterId("");
        setMedallionModeId("");
      }
    } catch {
      setError("Network error while registering medallion");
    } finally {
      setMedallionFormLoading(false);
    }
  }

  async function handleKillSwitch() {
    if (!selectedDeviceId) return;
    setKillLoading(true);
    setKillMessage(null);
    try {
      const res = await fetch(`/api/kill/${selectedDeviceId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setKillMessage(data.error || "Kill switch failed");
      } else {
        setKillMessage(data.killed ? "Device stopped." : "Kill switch acknowledged.");
      }
    } catch {
      setKillMessage("Network error");
    } finally {
      setKillLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Parent Dashboard
            </h1>
            <p className="text-sm text-slate-600">
              {user?.email ?? "Signed in"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {parent && !parent.consent_verified && (
          <div className="mb-6">
            <ConsentForm onVerified={loadData} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Devices</h2>
              <button
                onClick={loadData}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {devices.length === 0 ? (
              <p className="text-sm text-slate-500">No devices registered.</p>
            ) : (
              <ul className="space-y-2">
                {devices.map((device) => (
                  <li key={device.id}>
                    <button
                      onClick={() => setSelectedDeviceId(device.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        selectedDeviceId === device.id
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-medium text-slate-900">
                        {device.serial_number}
                      </div>
                      <div className="text-xs text-slate-500">
                        {device.device_type} • {device.is_active ? "Active" : "Inactive"}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              onSubmit={handleRegisterDevice}
              className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Register device
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Serial number"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  required
                />
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="companion">Companion</option>
                  <option value="speaker">Speaker</option>
                  <option value="prototype">Prototype</option>
                </select>
                <button
                  type="submit"
                  disabled={deviceFormLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Plus size={16} />
                  {deviceFormLoading ? "Registering..." : "Register"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="mb-4 font-semibold text-slate-900">Live panel</h2>

            {!selectedDevice ? (
              <p className="text-sm text-slate-500">
                Select a device to view its live status.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Activity size={16} /> Connection
                    </div>
                    <div className="mt-1 font-medium capitalize text-slate-900">
                      {connectionStatus}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Power size={16} /> State
                    </div>
                    <div className="mt-1 font-medium capitalize text-slate-900">
                      {String(serverState)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Battery size={16} /> Battery
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {battery !== null ? `${battery}%` : "—"}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-red-100 bg-red-50 p-4">
                  <h3 className="font-semibold text-red-900">Kill switch</h3>
                  <p className="mt-1 text-sm text-red-800">
                    Immediately stop the active session on this device.
                  </p>
                  <button
                    onClick={handleKillSwitch}
                    disabled={killLoading}
                    className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {killLoading ? "Stopping..." : "Stop device"}
                  </button>
                  {killMessage && (
                    <p className="mt-2 text-sm text-red-700">{killMessage}</p>
                  )}
                </div>

                {selectedDevice.api_key && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Device API key
                    </h3>
                    <p className="mt-1 break-all font-mono text-xs text-slate-700">
                      {selectedDevice.api_key}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Copy this key into the device configuration. It is shown
                      only once.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Medallions</h2>

          {medallions.length === 0 ? (
            <p className="text-sm text-slate-500">No medallions registered.</p>
          ) : (
            <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {medallions.map((medallion) => (
                <li
                  key={medallion.id}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="font-medium text-slate-900">
                    {medallion.nfc_tag_id}
                  </div>
                  <div className="text-xs text-slate-500">
                    {medallion.character_modes?.name ?? "No mode assigned"}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={handleRegisterMedallion}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Register medallion
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <input
                type="text"
                placeholder="NFC tag ID"
                value={nfcTagId}
                onChange={(e) => setNfcTagId(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:col-span-1"
                required
              />
              <select
                value={medallionCharacterId}
                onChange={(e) => setMedallionCharacterId(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:col-span-1"
              >
                <option value="">Character</option>
                {Array.from(
                  new Set(characterModes.map((m) => m.character_key))
                ).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <select
                value={medallionModeId}
                onChange={(e) => setMedallionModeId(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:col-span-1"
              >
                <option value="">Mode</option>
                {characterModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={medallionFormLoading}
                className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-1"
              >
                <Plus size={16} />
                {medallionFormLoading ? "Registering..." : "Register"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
