import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Prepare a separate static demo; never copy APIs, credentials or historical data.
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target || !isAbsolute(target) || resolve(target) === source)
  throw new Error("Indicá un directorio absoluto nuevo para la demo.");
await mkdir(dirname(target), { recursive: true });
await mkdir(target); // An existing demo must be updated deliberately, never overwritten.
for (const path of [
  "src/components",
  "src/domain",
  "src/offline",
  "src/server/backup.ts",
  "app/layout.tsx",
  "app/globals.css",
  "public",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".nvmrc",
]) {
  await mkdir(dirname(resolve(target, path)), { recursive: true });
  await cp(resolve(source, path), resolve(target, path), { recursive: true });
}
const pkg = JSON.parse(await readFile(resolve(target, "package.json"), "utf8"));
pkg.scripts = { build: "next build", typecheck: "tsc --noEmit" };
await writeFile(
  resolve(target, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n",
);
await writeFile(
  resolve(target, "app/page.tsx"),
  `import { FamilyApp } from "@/components/family-app";
export default function Page() {
  return <FamilyApp configured={false} demoAllowed environment="hosted-demo" />;
}
`,
);
await writeFile(
  resolve(target, "next.config.ts"),
  `import type { NextConfig } from "next";
const config: NextConfig = { output: "export", poweredByHeader: false };
export default config;
`,
);
await writeFile(
  resolve(target, ".gitignore"),
  "node_modules/\n.next/\nout/\n*.tsbuildinfo\n.env*\n",
);
await writeFile(
  resolve(target, "README.md"),
  `# Casa de los Gesualdo · demo

Demo estática privada, preparada desde mudanza-savanna con scripts/prepare-demo.ts.
Usa los mismos componentes, dominio e IndexedDB que la aplicación principal.
No incluye API, Google Login, IA, secretos ni referencias históricas reales.
Los datos de prueba permanecen en cada navegador y no se comparten.

Node 24: npm ci; npm run build. La salida está en out/.
La aplicación compartida seguirá usando Next.js, Vercel y Supabase.
`,
);
console.log(target);
