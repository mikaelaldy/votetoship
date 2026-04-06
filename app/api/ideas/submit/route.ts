import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { addSubmission, rateLimitSubmit } from "@/lib/kv";

type SubmissionPayload = {
  title?: string;
  description?: string;
};

function hashIp(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SubmissionPayload;
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();

    if (title.length < 2 || title.length > 60) {
      return NextResponse.json(
        { error: "Title must be between 2 and 60 characters" },
        { status: 400 }
      );
    }

    if (description.length < 20 || description.length > 220) {
      return NextResponse.json(
        { error: "Description must be between 20 and 220 characters" },
        { status: 400 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const ipHash = hashIp(ip);
    const allowed = await rateLimitSubmit(ipHash);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many submissions. Try again later." },
        { status: 429 }
      );
    }

    const submission = await addSubmission({
      title,
      description,
      sourceIpHash: ipHash,
    });

    return NextResponse.json({
      ok: true,
      submission: {
        id: submission.id,
        title: submission.title,
        description: submission.description,
        status: submission.status,
      },
      message: "Idea submitted. It will be moderated before entering a round.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
