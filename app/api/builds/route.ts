import { NextResponse } from "next/server";
import { listRecentBuilds } from "@/lib/store";

export async function GET() {
  try {
    const builds = await listRecentBuilds(80);
    return NextResponse.json({ builds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
