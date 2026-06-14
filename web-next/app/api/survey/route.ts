import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveSurvey } from "@/services/storage/supabase";

const bodySchema = z.object({
  email: z.string().email(),
  age: z.string().optional(),
  interests: z.array(z.string()).optional(),
  priorities: z.array(z.string()).optional(),
  feedback: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Invalid request body", details: msg }, { status: 400 });
  }

  const result = await saveSurvey({
    email: body.email,
    child_age: body.age,
    interests: body.interests?.join(", "),
    priorities: body.priorities?.join(", "),
    feedback: body.feedback,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
