import { expect, test } from "@playwright/test";
test("PWA: recarga completa sin señal conserva unidad y borrador", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.CI && process.env.E2E_SERVER_COMMAND !== "npm run start",
    "El service worker se registra con el build de producción.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Probar demo local" }).click();
  const input = page.getByRole("textbox", { name: "Mensaje para la mudanza" });
  await input.fill("Estoy armando una caja para la cocina");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(page.locator(".chat-context")).toContainText("C-001");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const draft = "Texto dictado que todavía no envié";
  await input.fill(draft);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("gesualdo-v1", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const values = await new Promise<{ draft: string }[]>(
          (resolve, reject) => {
            const request = db
              .transaction("documents")
              .objectStore("documents")
              .getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          },
        );
        db.close();
        return values[0]?.draft;
      }),
    )
    .toBe(draft);
  await context.setOffline(true);
  const response = await page.reload();
  expect(response?.status()).toBe(200);
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.locator(".chat-context")).toContainText("C-001");
  await expect(input).toHaveValue(draft);
  await expect(page.locator(".demo-banner")).toBeVisible();
  await context.setOffline(false);
});
