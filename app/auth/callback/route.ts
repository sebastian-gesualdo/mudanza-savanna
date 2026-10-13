import { NextResponse } from "next/server";
import { authClient, authenticate } from "@/server/auth";
import { DomainError } from "@/domain/model";
export async function GET(request: Request) {
  const base = process.env.APP_BASE_URL;
  if (!base) return new Response("Acceso sin configurar", { status: 503 });
  const headers = { "Cache-Control": "private, no-store" };
  let client: Awaited<ReturnType<typeof authClient>> | undefined;
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) throw new Error("Missing code");
    client = await authClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    await authenticate();
    return NextResponse.redirect(new URL("/", base), { headers });
  } catch (error) {
    if (client) await client.auth.signOut({ scope: "local" });
    const marker =
      error instanceof DomainError && error.status === 403
        ? "denied"
        : "failed";
    return NextResponse.redirect(new URL(`/?auth=${marker}`, base), {
      headers,
    });
  }
}
