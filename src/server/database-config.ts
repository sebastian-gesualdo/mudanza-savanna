import { getCACertificates } from "node:tls";
import type { PoolConfig } from "pg";
import { DomainError } from "../domain/model";
import { supabaseDatabaseCAs } from "./supabase-ca";

export function databasePoolConfig(
  env: Record<string, string | undefined> = process.env,
): PoolConfig {
  if (!env.DATABASE_URL)
    throw new DomainError(
      "SETUP_REQUIRED",
      "Falta configurar la conexión de la mudanza.",
      503,
    );
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new DomainError(
      "SETUP_REQUIRED",
      "La conexión de la mudanza no es una URL PostgreSQL válida.",
      503,
    );
  }
  const supabase =
    url.hostname.endsWith(".pooler.supabase.com") ||
    /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname);
  if (supabase && env.DATABASE_SSL === "false")
    throw new DomainError(
      "SETUP_REQUIRED",
      "La conexión con Supabase requiere TLS.",
      503,
    );
  // pg gives URL options precedence over the SSL object. Keep the application's
  // CA and verification settings authoritative, including for sslmode=require.
  for (const name of [
    "ssl",
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "sslnegotiation",
    "uselibpqcompat",
  ])
    url.searchParams.delete(name);
  return {
    connectionString: url.toString(),
    max: 5,
    ssl:
      env.DATABASE_SSL === "false"
        ? false
        : {
            rejectUnauthorized: true,
            ...(supabase && {
              ca: [...getCACertificates("default"), ...supabaseDatabaseCAs],
            }),
          },
    connectionTimeoutMillis: 10000,
  };
}
