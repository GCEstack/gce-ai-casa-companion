import { NextResponse } from "next/server";
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
    const { data: parent, error } = await serviceSupabase
      .from("parents")
      .select("id, email, consent_verified, consent_method, consent_at, stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Parent not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Failed to load parent" },
        { status: 500 }
      );
    }

    return NextResponse.json({ parent });
  } catch (error) {
    console.error("Parent GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
