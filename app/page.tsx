import { FamilyApp } from "@/components/family-app";
import { configured } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (configured() && process.env.APP_BASE_URL) {
    const canonical = new URL(process.env.APP_BASE_URL);
    if ((await headers()).get("host") !== canonical.host)
      redirect(canonical.href);
  }
  const demoAllowed =
    process.env.APP_DEMO === "true" ||
    (!configured() && process.env.APP_ENV !== "production");
  return (
    <FamilyApp
      configured={configured()}
      demoAllowed={demoAllowed}
      environment={process.env.APP_ENV ?? "development"}
    />
  );
}
