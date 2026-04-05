import { NextRequest, NextResponse } from "next/server";
import { getAppBySlug } from "@/lib/kv";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const app = await getAppBySlug(slug);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    return NextResponse.json({ app });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
