import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    const serviceSupabase = createServiceClient();

    const { data: existing } = await serviceSupabase
      .from("parents")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await serviceSupabase.from("parents").insert({
        id: user.id,
        email: user.email ?? "",
        consent_verified: false,
      });

      if (insertError) {
        return NextResponse.json(
          { error: "Failed to create parent record" },
          { status: 500 }
        );
      }
    }

    const { error: updateError } = await serviceSupabase
      .from("parents")
      .update({
        consent_verified: true,
        consent_method: "manual",
        consent_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update consent status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Consent confirm error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
