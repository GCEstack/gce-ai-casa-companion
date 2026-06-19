"use client";

import { useEffect, useState } from "react";

const KICKSTARTER_DATE = new Date("2026-05-05T09:00:00-04:00");

function getTimeLeft() {
  const diff = KICKSTARTER_DATE.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function Countdown() {
  const [time, setTime] = useState(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  const units = [
    { label: "Days", value: time.days },
    { label: "Hours", value: time.hours },
    { label: "Minutes", value: time.minutes },
    { label: "Seconds", value: time.seconds },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
      {units.map((u) => (
        <div
          key={u.label}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-casa-border bg-casa-card sm:h-20 sm:w-20"
        >
          <span className="font-serif text-2xl font-bold text-casa-goldLight sm:text-3xl">
            {String(u.value).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-casa-taupe">{u.label}</span>
        </div>
      ))}
    </div>
  );
}
