import { defineConfig, devices } from "@playwright/test";
const port = process.env.E2E_PORT ?? "3000";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
          : {},
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        launchOptions: process.env.CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command:
      process.env.E2E_SERVER_COMMAND ??
      (process.env.CI ? "npm run start" : "npm run dev"),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    env: {
      APP_DEMO: "true",
      APP_ENV: "development",
      PORT: port,
      APP_BASE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_URL: "https://auth.example.invalid",
      SUPABASE_PUBLISHABLE_KEY: "test-public-placeholder",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    },
  },
});
