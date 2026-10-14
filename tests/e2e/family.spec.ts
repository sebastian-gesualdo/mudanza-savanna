import { expect, test } from "@playwright/test";
test("chat: empacar, buscar, cargar, llegada y desempaque sin salir de conversación", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar demo local" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Seba" })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Mensaje para la mudanza" });
  const send = async (text: string) => {
    await input.fill(text);
    await expect(input).toHaveValue(text);
    await page
      .getByRole("button", { name: "Enviar mensaje", exact: true })
      .click();
    await expect(input).toHaveValue("");
  };
  await send("Estoy armando una caja para la cocina");
  await expect(page.locator(".chat-context")).toContainText("C-001");
  await send("Pava eléctrica");
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "Agregado a C-001",
  );
  await send("Cerrala");
  await expect(page.locator(".chat-context")).toContainText("Cerrada");
  await send("¿Dónde está el hervidor?");
  await expect(page.locator(".chat-unit").last()).toContainText(
    "Pava eléctrica",
  );
  await send("Cargar C-001");
  await expect(page.locator(".chat-context")).toContainText("Cargada");
  await send("C-001 llegó a casa");
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "¿Dónde quedó",
  );
  await page
    .locator(".choices")
    .last()
    .getByRole("button", { name: "Kitchen", exact: true })
    .click();
  await expect(page.locator(".chat-context")).toContainText("Llegó");
  await send("Terminar desempaque");
  await page
    .getByRole("button", { name: "Confirmar caja vacía", exact: true })
    .click();
  await expect(page.locator(".chat-context")).toContainText("Desempacada");
  await send("¿Dónde está el hervidor?");
  await expect(page.locator(".chat-unit").last()).toContainText("ya se retiró");
  await page.reload();
  await expect(page.locator(".chat-context")).toContainText("Desempacada");
  await expect(page.locator(".composer")).toBeVisible();
  await page.screenshot({ path: "test-results/chat.png", fullPage: true });
});
test("controles manuales, búsquedas e historial con demo explícita", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar demo local" }).click();
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page
    .getByRole("button", { name: "Nuestras cosas", exact: true })
    .click();
  await page.getByRole("button", { name: "Crear unidad", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("furniture");
  await page
    .getByLabel("Nombre o descripción", { exact: true })
    .fill("Escritorio blanco");
  await page
    .getByRole("combobox", { name: "Destino en la casa nueva", exact: true })
    .selectOption("office");
  await page
    .getByRole("button", { name: "Crear y trabajar con esta unidad" })
    .click();
  await expect(page.locator(".chat-context")).toContainText("M-001");
  await page
    .getByRole("button", { name: "Ver ficha de unidad activa" })
    .click();
  await expect(page.getByRole("button", { name: "Cerrar mueble" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Historial", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar datos", exact: true }).click();
  await page
    .getByLabel("Nombre o descripción")
    .fill("Escritorio de la oficina");
  await page
    .getByRole("button", { name: "Guardar cambio", exact: true })
    .click();
  await expect(page.locator(".page-content")).toContainText(
    "Escritorio de la oficina",
  );
  await page
    .getByRole("button", { name: "Volver al chat", exact: true })
    .last()
    .click();
  await page.screenshot({ path: "test-results/manual.png", fullPage: true });
});

test("separar contenido y corregir un estado conserva cantidades e historial", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar demo local" }).click();
  const input = page.getByRole("textbox", { name: "Mensaje para la mudanza" });
  await input.fill("Estoy armando una caja para la cocina");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(page.locator(".chat-context")).toContainText("C-001");
  await page
    .getByRole("button", { name: "Agregar contenido a C-001", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descripción", { exact: true }).fill("Platos azules");
  await dialog.getByLabel("Cantidad · opcional").fill("6");
  await dialog
    .getByRole("button", { name: "Guardar cambio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ver ficha de unidad activa" })
    .click();
  await page
    .getByRole("button", { name: "Separar parte del contenido" })
    .click();
  await dialog
    .getByLabel("Descripción de la parte")
    .fill("Platos azules para comedor");
  await dialog.getByLabel("Cantidad que separás").fill("2");
  await dialog
    .getByRole("button", { name: "Guardar cambio", exact: true })
    .click();
  await expect(page.locator(".page-content")).toContainText("cantidad: 4");
  await expect(page.locator(".page-content")).toContainText("cantidad: 2");
  await page
    .getByRole("button", { name: "Volver al chat", exact: true })
    .last()
    .click();
  await input.fill("Cerrala");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(page.locator(".chat-context")).toContainText("Cerrada");
  await input.fill("Cargar C-001");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(page.locator(".chat-context")).toContainText("Cargada");
  await page
    .getByRole("button", { name: "Ver ficha de unidad activa" })
    .click();
  await page
    .getByRole("button", { name: "Corregir estado o ubicación" })
    .click();
  await dialog
    .getByLabel("Traslado", { exact: true })
    .selectOption("at_origin");
  await dialog
    .getByLabel("Confirmo el nuevo estado y su efecto sobre el contenido")
    .check();
  await dialog
    .getByRole("button", { name: "Guardar cambio", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".page-content")).toContainText(
    "ubicación corregida",
  );
});
