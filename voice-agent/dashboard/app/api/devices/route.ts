import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
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
    const { data: devices, error } = await serviceSupabase
      .from("devices")
      .select("*")
      .eq("parent_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load devices" },
        { status: 500 }
      );
    }

    return NextResponse.json({ devices });
  } catch (error) {
    console.error("Devices GET error:", error);
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
    const serialNumber = body?.serial_number;
    const deviceType = body?.device_type ?? "companion";

    if (!serialNumber || typeof serialNumber !== "string") {
      return NextResponse.json(
        { error: "serial_number is required" },
        { status: 400 }
      );
    }

    const apiKey = randomBytes(32).toString("hex");

    const serviceSupabase = createServiceClient();
    const { data: device, error } = await serviceSupabase
      .from("devices")
      .insert({
        parent_id: user.id,
        serial_number: serialNumber,
        device_type: deviceType,
        api_key: apiKey,
        is_active: true,
      })
      .select()
      .single();

    if (error || !device) {
      return NextResponse.json(
        { error: "Failed to create device" },
        { status: 500 }
      );
    }

    return NextResponse.json({ device });
  } catch (error) {
    console.error("Devices POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
