"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Device } from "@/lib/types";

interface DeviceRegistrationFormProps {
  onRegister: (device: Device) => void;
  onError: (message: string) => void;
}

export default function DeviceRegistrationForm({
  onRegister,
  onError,
}: DeviceRegistrationFormProps) {
  const [serialNumber, setSerialNumber] = useState("");
  const [deviceType, setDeviceType] = useState("companion");
  const [deviceFormLoading, setDeviceFormLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
        onError(data.error || "Failed to register device");
      } else {
        onRegister(data.device);
        setSerialNumber("");
      }
    } catch {
      onError("Network error while registering device");
    } finally {
      setDeviceFormLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
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
  );
}
