import { NextResponse } from "next/server";
import { characters } from "@/lib/characters";

export async function GET() {
  const sanitized = characters.map((c) => ({
    key: c.key,
    name: c.name,
    meaning: c.meaning,
    image: c.image,
    voice: c.voice,
    realtimeVoice: c.realtimeVoice,
  }));
  return NextResponse.json({ characters: sanitized });
}
