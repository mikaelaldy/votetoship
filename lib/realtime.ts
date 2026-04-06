import Pusher from "pusher";

let client: Pusher | null = null;

function isConfigured() {
  return !!(
    process.env.PUSHER_APP_ID &&
    process.env.PUSHER_KEY &&
    process.env.PUSHER_SECRET &&
    process.env.PUSHER_CLUSTER
  );
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    client = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return client;
}

export function getRoundChannel(roundId: string) {
  return `round-${roundId}`;
}

export const GLOBAL_CHANNEL = "arena-global";

export async function publishRoundEvent(
  roundId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(getRoundChannel(roundId), event, payload);
  } catch {
    // no-op
  }
}

export async function publishGlobalEvent(
  event: string,
  payload: Record<string, unknown>
) {
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(GLOBAL_CHANNEL, event, payload);
  } catch {
    // no-op
  }
}

export function isRealtimeEnabled() {
  return isConfigured();
}
