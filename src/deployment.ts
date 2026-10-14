// Only the nonsecret deployment target is embedded by Next.js at build time.
// Vercel system variables may be absent in the running function.
export function deploymentEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.VERCEL_ENV ||
    (env === process.env ? process.env.CASA_BUILD_ENV : env.CASA_BUILD_ENV) ||
    env.APP_ENV ||
    "development"
  );
}
