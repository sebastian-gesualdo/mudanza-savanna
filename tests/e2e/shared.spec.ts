import { expect, test, BrowserContext } from "@playwright/test";
import { execute } from "../../src/domain/commands";
import { emptyState } from "../../src/domain/model";
const sebas = "00000000-0000-4000-8000-000000000011";
const lu = "00000000-0000-4000-8000-000000000012";
const move = "00000000-0000-4000-8000-000000000013";
// Mocked HTTP requests must reach route handlers; PWA service-worker behavior is tested in offline.spec.ts.
test.use({ serviceWorkers: "block" });
// HTTP/Auth adapter simulated. PostgreSQL transactions are tested separately.
test("dos cuentas sincronizan cambios y una cola offline conserva autoría al reabrir", async ({
  browser,
  baseURL,
  viewport,
  isMobile,
  hasTouch,
  userAgent,
}) => {
  let state = emptyState(move, [
    { id: sebas, nickname: "Sebas", version: 1 },
    { id: lu, nickname: "Lu", version: 1 },
  ]);
  const contexts: BrowserContext[] = [];
  async function participant(actor: string) {
    const context = await browser.newContext({
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      userAgent,
      serviceWorkers: "block",
    });
    contexts.push(context);
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice(5);
      const data = request.method() === "GET" ? {} : request.postDataJSON();
      let result: unknown = {};
      if (path === "bootstrap")
        result = {
          account: { userId: actor, email: `${actor}@example.invalid` },
          participant: state.participants.find((p) => p.id === actor),
          move: { id: move },
          participants: state.participants,
        };
      else if (path === "inventory/snapshot") result = state;
      else if (path === "conversations" || path.endsWith("/context"))
        result = { version: 1, active_unit_id: data.activeUnitId ?? null };
      else if (path === "labels/reserve") result = { codes: [] };
      else if (path === "sync") {
        const after = Number(
          new URL(request.url()).searchParams.get("after") ?? 0,
        );
        const events = state.events.filter((e) => e.revision > after);
        result = {
          events,
          nextCursor: state.revision,
          hasMore: false,
          headRevision: state.revision,
          counters: state.counters,
        };
      } else if (
        path === "commands" ||
        (path === "chat/messages" && data.structuredCommand)
      ) {
        const c = data.structuredCommand ?? data.command;
        if (c.expectedParticipantId !== actor) {
          await route.fulfill({
            status: 409,
            json: { code: "ACTOR_MISMATCH", message: "La cuenta cambió" },
          });
          return;
        }
        const applied = execute(state, c, actor);
        state = applied.state;
        result = { receipt: applied.receipt };
      } else if (path === "chat/messages")
        result = { text: "Consulta simulada" };
      else {
        await route.fulfill({
          status: 404,
          json: { code: "NOT_FOUND", message: "Ruta de prueba ausente" },
        });
        return;
      }
      await route.fulfill({ status: 200, json: result });
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: `Hola, ${actor === sebas ? "Sebas" : "Lu"}`,
      }),
    ).toBeVisible();
    return { page, context };
  }
  try {
    const first = await participant(sebas);
    const second = await participant(lu);
    const input = first.page.getByRole("textbox", {
      name: "Mensaje para la mudanza",
    });
    await input.fill("Estoy armando una caja para la cocina");
    await first.page
      .getByRole("button", { name: "Enviar mensaje", exact: true })
      .click();
    await expect.poll(() => state.units.length).toBe(1);
    await second.page.reload();
    await second.page
      .getByRole("button", { name: "Abrir menú", exact: true })
      .click();
    await second.page
      .getByRole("button", { name: "Nuestras cosas", exact: true })
      .click();
    await expect(second.page.locator(".page-content")).toContainText("C-001");
    await first.context.setOffline(true);
    await input.fill("Texto offline de Sebas");
    await first.page
      .getByRole("button", { name: "Enviar mensaje", exact: true })
      .click();
    await expect(first.page.locator(".bubble.assistant").last()).toContainText(
      "Cambio conservado",
    );
    expect(state.entries).toHaveLength(0);
    await first.context.setOffline(false);
    await first.page.reload();
    await expect.poll(() => state.entries.length).toBe(1);
    expect(state.entries[0].description).toBe("Texto offline de Sebas");
    expect(state.entries[0].createdBy).toBe(sebas);
    await second.page.reload();
    await second.page
      .getByRole("button", { name: "Abrir menú", exact: true })
      .click();
    await second.page
      .getByRole("button", { name: "Nuestras cosas", exact: true })
      .click();
    await second.page.getByRole("button", { name: /C-001/ }).first().click();
    await expect(second.page.locator(".page-content")).toContainText(
      "Texto offline de Sebas",
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("revisión histórica conserva un lote hasta confirmar y deja Removed excluido", async ({
  page,
}) => {
  let state = emptyState(move, [{ id: sebas, nickname: "Sebas", version: 1 }]);
  const candidates = [
    {
      row: 1,
      source: "test-history",
      name: "Mesa revisada",
      count: 1,
      comment: "Original conservado",
      oldRoom: "Casa anterior",
      action: "OK",
      warnings: [],
      container: false,
    },
    {
      row: 2,
      source: "test-history",
      name: "Contenedor retirado",
      count: 1,
      comment: "No existe",
      oldRoom: "Garage anterior",
      action: "Removed",
      warnings: [],
      container: true,
    },
  ];
  const committed = new Set<number>();
  let commitCalls = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(5);
    const data =
      route.request().method() === "GET" ? {} : route.request().postDataJSON();
    let result: unknown = {};
    if (path === "bootstrap")
      result = {
        account: { userId: sebas, email: "test@example.invalid" },
        participant: state.participants[0],
        move: { id: move },
      };
    else if (path === "inventory/snapshot") result = state;
    else if (path === "conversations" || path.endsWith("/context"))
      result = { version: 1, active_unit_id: null };
    else if (path === "labels/reserve") result = { codes: [] };
    else if (path === "imports/preview")
      result = {
        candidates,
        sessionId: move,
        rows: candidates.map((c) => ({
          row_number: c.row,
          status: committed.has(c.row) ? "applied" : "pending",
        })),
      };
    else if (path === "imports/commit") {
      commitCalls++;
      for (const row of data.rows)
        if (row.exists && !committed.has(row.row)) {
          const source = candidates.find((c) => c.row === row.row)!;
          const c = {
            operationId: crypto.randomUUID(),
            expectedParticipantId: sebas,
            expectedVersions: {},
            action: {
              type: "create_unit" as const,
              payload: {
                id: crypto.randomUUID(),
                kind: row.kind,
                name: row.name,
                count: row.count,
                destination: row.destination,
                provenance: {
                  source: source.source,
                  row: source.row,
                  comment: source.comment,
                },
              },
            },
          };
          state = execute(state, c, sebas).state;
          committed.add(row.row);
        }
      result = {
        rows: data.rows.map((r: { row: number; exists: boolean }) => ({
          row: r.row,
          status: r.exists ? "applied" : "excluded",
        })),
      };
    } else if (path === "sync") {
      const after = Number(
        new URL(route.request().url()).searchParams.get("after") ?? 0,
      );
      result = {
        events: state.events.filter((e) => e.revision > after),
        nextCursor: state.revision,
        hasMore: false,
        headRevision: state.revision,
        counters: state.counters,
      };
    } else {
      await route.fulfill({
        status: 404,
        json: { message: "Ruta de prueba ausente" },
      });
      return;
    }
    await route.fulfill({ status: 200, json: result });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hola, Sebas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Cuenta y ajustes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar muebles históricos" })
    .click();
  await expect(page.locator(".page-content")).not.toContainText(
    "Contenedor retirado",
  );
  await page.getByRole("button", { name: "Revisar fila", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Destino en la casa nueva", exact: true })
    .selectOption("office");
  await dialog
    .getByRole("button", { name: "Guardar revisión de esta fila" })
    .click();
  await expect(page.locator(".page-content")).toContainText(
    "1 filas revisadas",
  );
  expect(state.units).toHaveLength(0);
  expect(commitCalls).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Cuenta y ajustes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar muebles históricos" })
    .click();
  await expect(page.locator(".page-content")).toContainText(
    "1 filas revisadas",
  );
  await page
    .getByRole("button", { name: "Confirmar revisión por lotes" })
    .click();
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect.poll(() => state.units.length).toBe(1);
  expect(state.units[0].destination).toBe("office");
  expect(state.units[0].provenance?.comment).toBe("Original conservado");
  expect(commitCalls).toBe(1);
});
