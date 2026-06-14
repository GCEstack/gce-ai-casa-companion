import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCharacter } from "@/lib/characters";
import { createRealtimeSession } from "@/services/ai/realtime";

const bodySchema = z.object({
  character: z.string().default("corvo"),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Invalid request body", details: msg }, { status: 400 });
  }

  const character = getCharacter(body.character);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const result = await createRealtimeSession(character.realtimeVoice);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    token: result.token,
    expires_at: result.expires_at,
    voice: character.realtimeVoice,
    character: character.key,
  });
}
