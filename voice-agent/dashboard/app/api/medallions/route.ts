import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();
    const { data: medallions, error } = await serviceSupabase
      .from("medallions")
      .select("*, character_modes(name)")
      .eq("parent_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load medallions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ medallions });
  } catch (error) {
    console.error("Medallions GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const nfcTagId = body?.nfc_tag_id;
    const characterId = body?.character_id;
    const modeId = body?.mode_id;

    if (!nfcTagId || typeof nfcTagId !== "string") {
      return NextResponse.json(
        { error: "nfc_tag_id is required" },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceClient();
    const { data: medallion, error } = await serviceSupabase
      .from("medallions")
      .insert({
        parent_id: user.id,
        nfc_tag_id: nfcTagId,
        character_id: characterId ?? null,
        mode_id: modeId ?? null,
      })
      .select()
      .single();

    if (error || !medallion) {
      return NextResponse.json(
        { error: "Failed to create medallion" },
        { status: 500 }
      );
    }

    return NextResponse.json({ medallion });
  } catch (error) {
    console.error("Medallions POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
