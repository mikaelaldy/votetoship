import { NextResponse } from "next/server";
import { getAppHistory } from "@/lib/kv";

export async function GET() {
  try {
    const history = await getAppHistory();
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
