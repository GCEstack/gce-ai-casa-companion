"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import ConsentForm from "@/components/ConsentForm";
import DeviceList from "@/components/dashboard/DeviceList";
import DeviceRegistrationForm from "@/components/dashboard/DeviceRegistrationForm";
import LiveStatusPanel from "@/components/dashboard/LiveStatusPanel";
import MedallionManager from "@/components/dashboard/MedallionManager";
import type { User, Session } from "@supabase/supabase-js";
import type {
  Device,
  Parent,
  CharacterMode,
  Medallion,
  ServerState,
} from "@/lib/types";

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

    const token = session.access_token;
    const decoder = new TextDecoder();
    let buffer = "";
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentController: AbortController | null = null;

    async function connect() {
      if (cancelled) return;
      setConnectionStatus("connecting");
      currentController = new AbortController();

      try {
        const response = await fetch(
          `${voiceServerUrl}/events/${selectedDeviceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: currentController.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!response.body) {
          throw new Error("No response body");
        }

        setConnectionStatus("connected");
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const data = JSON.parse(payload);
              if (typeof data.state === "string") {
                setServerState(data.state);
              }
              if (typeof data.battery === "number") {
                setBattery(data.battery);
              }
            } catch {
              // Ignore malformed events.
            }
          }
        }
      } catch (err) {
        if (
          cancelled ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        console.error("SSE error:", err);
        setConnectionStatus("error");
      } finally {
        currentController = null;
        if (!cancelled) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      currentController?.abort();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      setConnectionStatus("disconnected");
    };
  }, [selectedDeviceId, session, voiceServerUrl]);

  function handleRegisterDevice(device: Device) {
    setDevices((prev) => [device, ...prev]);
  }

  function handleRegisterMedallion(medallion: Medallion) {
    setMedallions((prev) => [medallion, ...prev]);
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
            <DeviceList
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
              onRefresh={loadData}
            />
            <DeviceRegistrationForm
              onRegister={handleRegisterDevice}
              onError={setError}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <LiveStatusPanel
              selectedDevice={selectedDevice}
              connectionStatus={connectionStatus}
              serverState={serverState}
              battery={battery}
              killLoading={killLoading}
              killMessage={killMessage}
              onKillSwitch={handleKillSwitch}
            />
          </section>
        </div>

        <MedallionManager
          medallions={medallions}
          characterModes={characterModes}
          onRegister={handleRegisterMedallion}
          onError={setError}
        />
      </div>
    </main>
  );
}
