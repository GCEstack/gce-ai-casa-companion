"use client";

import { Activity, Battery, Power } from "lucide-react";
import type { Device, ServerState } from "@/lib/types";

interface LiveStatusPanelProps {
  selectedDevice: Device | null;
  connectionStatus: string;
  serverState: ServerState;
  battery: number | null;
  killLoading: boolean;
  killMessage: string | null;
  onKillSwitch: () => void;
}

export default function LiveStatusPanel({
  selectedDevice,
  connectionStatus,
  serverState,
  battery,
  killLoading,
  killMessage,
  onKillSwitch,
}: LiveStatusPanelProps) {
  return (
    <>
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
              onClick={onKillSwitch}
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
                Copy this key into the device configuration. It is shown only
                once.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
