import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  connect,
  createServer,
  type ConnectionOptions,
  type Server,
} from "node:tls";
import { Client } from "pg";
import { databasePoolConfig } from "../src/server/database-config";
import { supabaseDatabaseCAs } from "../src/server/supabase-ca";

const connection =
  "postgresql://postgres.test:local-test-only@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
function clientSSL(suffix = "") {
  const client = new Client(
    databasePoolConfig({ DATABASE_URL: connection + suffix }),
  );
  // @types/pg declares boolean, but pg also exposes its TLS options here.
  return client.ssl as unknown as ConnectionOptions;
}

describe("confianza TLS de PostgreSQL", () => {
  it("incluye únicamente las raíces de producción oficiales y vigentes", () => {
    expect(
      supabaseDatabaseCAs.map((pem) => new X509Certificate(pem).fingerprint256),
    ).toEqual([
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
      "5F:9B:77:95:1A:7A:A1:30:3F:9B:58:EE:A9:BF:A8:9E:35:8C:FD:C1:5F:97:86:FF:10:D4:93:0A:72:2C:9A:E2",
    ]);
    for (const pem of supabaseDatabaseCAs) {
      const certificate = new X509Certificate(pem);
      expect(certificate.ca).toBe(true);
      expect(certificate.verify(certificate.publicKey)).toBe(true);
      expect(Date.parse(certificate.validFrom)).toBeLessThan(Date.now());
      expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now());
    }
  });
  it.each([
    "",
    "?sslmode=require",
    "?sslmode=disable&uselibpqcompat=true",
    "?ssl=no-verify",
    "?sslrootcert=/nonexistent.crt&sslcert=/nonexistent.crt&sslkey=/nonexistent.key",
  ])("pg conserva CA y verificación incluso con opciones URL %s", (suffix) => {
    const ssl = clientSSL(suffix);
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity).toBeUndefined();
    expect(ssl.ca).toEqual(expect.arrayContaining(supabaseDatabaseCAs));
  });
  it("confía en las mismas raíces para la conexión directa", () => {
    const config = databasePoolConfig({
      DATABASE_URL:
        "postgresql://postgres:local-test-only@db.testproject.supabase.co/postgres",
    });
    expect(config.ssl).toMatchObject({
      rejectUnauthorized: true,
      ca: expect.arrayContaining(supabaseDatabaseCAs),
    });
  });
  it("mantiene PostgreSQL local sin SSL y rechaza desactivarlo en Supabase", () => {
    const local = databasePoolConfig({
      DATABASE_URL:
        "postgresql://postgres:local-test-only@localhost/postgres?sslmode=require",
      DATABASE_SSL: "false",
    });
    expect(new Client(local).ssl).toBe(false);
    expect(() =>
      databasePoolConfig({ DATABASE_URL: connection, DATABASE_SSL: "false" }),
    ).toThrow("requiere TLS");
  });
  it("no añade raíces de Supabase a otros proveedores ni revela una URL inválida", () => {
    expect(
      databasePoolConfig({
        DATABASE_URL: "postgresql://postgres@other.example/postgres",
      }).ssl,
    ).toEqual({ rejectUnauthorized: true });
    expect(() =>
      databasePoolConfig({ DATABASE_URL: "invalid-secret-value" }),
    ).toThrow("no es una URL PostgreSQL válida");
    expect(() => databasePoolConfig({})).toThrow("Falta configurar");
  });
});

describe("handshake TLS real con las opciones del cliente pg", () => {
  let server: Server;
  let directory: string;
  let port: number;
  let testCA: string;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "gesualdo-tls-test-"));
    const openssl = (args: string[]) =>
      execFileSync("openssl", args, { cwd: directory, stdio: "ignore" });
    openssl([
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=Local test CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
    ]);
    openssl([
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-subj",
      "/CN=localhost",
      "-keyout",
      "server.key",
      "-out",
      "server.csr",
    ]);
    writeFileSync(
      join(directory, "server.ext"),
      "subjectAltName=DNS:localhost\nbasicConstraints=critical,CA:FALSE\n",
    );
    openssl([
      "x509",
      "-req",
      "-in",
      "server.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-days",
      "1",
      "-extfile",
      "server.ext",
      "-out",
      "server.crt",
    ]);
    testCA = readFileSync(join(directory, "ca.crt"), "utf8");
    server = createServer(
      {
        key: readFileSync(join(directory, "server.key")),
        cert: readFileSync(join(directory, "server.crt"), "utf8") + testCA,
      },
      (socket) => socket.end(),
    );
    server.on("tlsClientError", () => {});
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test TLS port");
    port = address.port;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  function handshake(options: ConnectionOptions, servername = "localhost") {
    return new Promise<boolean>((resolve, reject) => {
      const socket = connect({
        ...options,
        host: "127.0.0.1",
        port,
        servername,
      });
      socket.once("secureConnect", () => {
        const authorized = socket.authorized;
        socket.end();
        resolve(authorized);
      });
      socket.once("error", (error) => {
        socket.destroy();
        reject(error);
      });
    });
  }
  it("rechaza una cadena autofirmada ajena", async () => {
    await expect(handshake(clientSSL())).rejects.toMatchObject({
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
  });
  it("acepta una cadena con CA confiable", async () => {
    const options = clientSSL("?sslmode=require");
    await expect(
      handshake({ ...options, ca: [...(options.ca as string[]), testCA] }),
    ).resolves.toBe(true);
  });
  it("rechaza otro hostname aunque la CA sea confiable", async () => {
    const options = clientSSL();
    await expect(
      handshake(
        { ...options, ca: [...(options.ca as string[]), testCA] },
        "other.example",
      ),
    ).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
  });
});
