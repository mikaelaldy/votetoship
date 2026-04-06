import { NextResponse } from "next/server";
import { listBuildHistory } from "@/lib/store";

export async function GET() {
  try {
    const history = await listBuildHistory();
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
