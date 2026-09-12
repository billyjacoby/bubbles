import { NextResponse } from "next/server";
import { normalizeServerUrl } from "@bubbles/shared";
import { clearConnection, setConnection } from "@/lib/session";

/**
 * Validate credentials and store them.
 *
 * The `/ping` check runs here on the server rather than in the browser so that
 * a misconfigured CORS policy surfaces as a clear setup error instead of an
 * opaque network failure.
 */
export async function POST(request: Request) {
  let body: { serverUrl?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { serverUrl, password } = body;
  if (!serverUrl?.trim() || !password?.trim()) {
    return NextResponse.json(
      { error: "Server URL and password are both required." },
      { status: 400 },
    );
  }

  let origin: string;
  try {
    origin = normalizeServerUrl(serverUrl);
  } catch {
    return NextResponse.json({ error: "That server URL is not valid." }, { status: 400 });
  }

  const url = new URL(`${origin}/api/v1/ping`);
  url.searchParams.set("guid", password);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        skip_zrok_interstitial: "true",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach that server. Check the URL and that the server is running." },
      { status: 502 },
    );
  }

  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ error: "Incorrect server password." }, { status: 401 });
  }
  if (res.status !== 200) {
    return NextResponse.json(
      { error: `Server responded with status ${res.status}.` },
      { status: 502 },
    );
  }

  await setConnection({ serverUrl: origin, password });
  return NextResponse.json({ serverUrl: origin });
}

export async function DELETE() {
  await clearConnection();
  return NextResponse.json({ ok: true });
}
