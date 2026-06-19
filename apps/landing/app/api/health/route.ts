import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "casa-landing",
    timestamp: new Date().toISOString(),
  });
}
