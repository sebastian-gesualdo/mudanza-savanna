import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DomainError } from "../domain/model";
import { bindMembership } from "./database";
import { deploymentEnvironment } from "../deployment";
export const configured = () => {
  // A mis-scoped environment variable must never connect a preview to this family's production data.
  if (
    deploymentEnvironment() === "preview" &&
    (process.env.SUPABASE_URL?.includes("jncnmxsiylhqeycqhhya.supabase.co") ||
      process.env.APP_BASE_URL?.includes("mudanza-savanna.vercel.app") ||
      process.env.DATABASE_URL?.includes("jncnmxsiylhqeycqhhya"))
  )
    return false;
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_PUBLISHABLE_KEY &&
      process.env.DATABASE_URL &&
      process.env.APP_BASE_URL,
  );
};
export async function authClient() {
  if (!configured())
    throw new DomainError(
      "SETUP_REQUIRED",
      "El acceso familiar todavía no está configurado.",
      503,
    );
  const jar = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { flowType: "pkce" },
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(process.env.APP_BASE_URL!).protocol === "https:",
        path: "/",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) =>
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          ),
      },
    },
  );
}
export async function authenticate() {
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 500
    )
      throw new DomainError(
        "AUTH_UNAVAILABLE",
        "No pudimos verificar tu cuenta. Tus pendientes se conservan.",
        503,
      );
    throw new DomainError(
      "SESSION_REQUIRED",
      "Volvé a ingresar con Google. Tus pendientes se conservan.",
      401,
    );
  }
  if (!data.user)
    throw new DomainError("SESSION_REQUIRED", "Ingresá con Google.", 401);
  return bindMembership(data.user);
}
export function checkOrigin(request: Request) {
  const origin = process.env.APP_BASE_URL;
  if (!origin || request.headers.get("origin") !== new URL(origin).origin)
    throw new DomainError(
      "ORIGIN",
      "Abrí la aplicación desde su dirección habitual.",
      403,
    );
}
