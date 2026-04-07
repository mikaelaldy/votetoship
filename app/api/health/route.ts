import { NextResponse } from "next/server";

interface HealthCheckResult {
  name: string;
  ok: boolean;
  message: string;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  const results: HealthCheckResult[] = [];

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const glmApiKey = process.env.GLM_API_KEY || "";

  const supabaseUrlOk = !!supabaseUrl && isValidHttpUrl(supabaseUrl);
  results.push({
    name: "SUPABASE_URL",
    ok: supabaseUrlOk,
    message: supabaseUrlOk ? "valid" : "missing or invalid HTTP/HTTPS URL",
  });

  const supabaseKeyOk = supabaseKey.length > 0;
  results.push({
    name: "SUPABASE_SERVICE_ROLE_KEY",
    ok: supabaseKeyOk,
    message: supabaseKeyOk ? "present" : "missing",
  });

  const glmKeyOk = glmApiKey.length > 0;
  results.push({
    name: "GLM_API_KEY",
    ok: glmKeyOk,
    message: glmKeyOk ? "present" : "missing",
  });

  const ok = results.every((item) => item.ok);

  return NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      checks: results,
    },
    { status: ok ? 200 : 503 }
  );
}
