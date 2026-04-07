import { NextRequest } from "next/server";

const DEFAULT_ADMIN_TOKEN = "mikacend-demo";

export function isAdminToken(token: string | null | undefined) {
  const expected = process.env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN;
  return Boolean(expected) && token === expected;
}

export function isAdminRequest(request: NextRequest) {
  return isAdminToken(request.headers.get("x-admin-token"));
}
