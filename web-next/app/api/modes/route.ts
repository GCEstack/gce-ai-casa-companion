import { NextResponse } from "next/server";
import { modes } from "@/lib/modes";

export async function GET() {
  const sanitized = modes.map((m) => ({
    key: m.key,
    name: m.name,
    icon: m.icon,
  }));
  return NextResponse.json({ modes: sanitized });
}
