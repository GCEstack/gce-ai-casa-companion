"use client";

import { RefreshCw } from "lucide-react";
import type { Device } from "@/lib/types";

interface DeviceListProps {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
  onRefresh: () => void;
}

export default function DeviceList({
  devices,
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
}: DeviceListProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Devices</h2>
        <button
          onClick={onRefresh}
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
                onClick={() => onSelectDevice(device.id)}
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
    </>
  );
}
