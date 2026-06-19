import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { textToSpeech } from "@/services/ai/tts";

const bodySchema = z.object({
  text: z.string().min(1),
  lang: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Invalid request body", details: msg }, { status: 400 });
  }

  try {
    return await textToSpeech({ text: body.text, lang: body.lang });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
