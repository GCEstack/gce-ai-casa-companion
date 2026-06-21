import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deviceId = params.deviceId;
    const voiceServerUrl = process.env.VOICE_SERVER_URL;

    if (!voiceServerUrl) {
      return NextResponse.json(
        { error: "Voice server not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(`${voiceServerUrl}/api/kill/${deviceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: "Kill switch failed", detail: text },
        { status: response.status }
      );
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json({ killed: data?.killed ?? true });
  } catch (error) {
    console.error("Kill switch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
