import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCharacter } from "@/lib/characters";
import { getMode } from "@/lib/modes";
import { COPYRIGHT_GUARD } from "@/lib/guard";
import { chat } from "@/services/ai/chat";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const bodySchema = z.object({
  message: z.string().min(1),
  history: z.array(messageSchema).default([]),
  character: z.string().default("corvo"),
  mode: z.string().optional(),
  customName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    body = bodySchema.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Invalid request body", details: msg }, { status: 400 });
  }

  const character = getCharacter(body.character);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const mode = getMode(body.mode);

  let systemPrompt = character.prompt + COPYRIGHT_GUARD;
  if (mode) {
    systemPrompt += mode.prompt;
  }
  if (body.customName) {
    systemPrompt += `\n\nIMPORTANT: The child has named you '${body.customName}'. Use this name when referring to yourself. Your original name is ${character.name} but the child prefers ${body.customName}.`;
  }

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...body.history.slice(-10),
    { role: "user" as const, content: body.message },
  ];

  const result = await chat({ messages, maxTokens: 250, temperature: 0.85 });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ response: result.text });
}
