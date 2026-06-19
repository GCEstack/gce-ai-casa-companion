import { NextRequest, NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters";
import { exchangeRealtimeSdp } from "@/services/ai/realtime";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const characterKey = req.nextUrl.searchParams.get("character") || "corvo";
  const character = getCharacter(characterKey);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const offerSdp = await req.text();
  if (!offerSdp) {
    return NextResponse.json({ error: "Missing SDP offer" }, { status: 400 });
  }

  const response = await exchangeRealtimeSdp(offerSdp, character.realtimeVoice);
  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status, statusText: response.statusText });
  }

  return response;
}
