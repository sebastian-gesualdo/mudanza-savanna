import { expect, it } from "vitest";
import { command, execute } from "../src/domain/commands";
import { interpret, resolveRoom } from "../src/domain/chat";
import { actorId, run, unitId, withBox } from "./fixtures";
it("resuelve alias exactos sin asignar baños o master ambiguos", () => {
  expect(resolveRoom("Cocina")?.key).toBe("kitchen");
  expect(resolveRoom("Dinning Room")?.key).toBe("dining-room");
  expect(resolveRoom("baño")).toBeNull();
  expect(resolveRoom("master")).toBeNull();
});
it("crea por chat y solicita solo el destino faltante", () => {
  const reply = interpret(
    withBox(),
    actorId,
    "Estoy armando una caja para la cocina",
    null,
  );
  expect(reply.command?.action.type).toBe("create_unit");
  expect(reply.literal).toBe(true);
  const missing = interpret(withBox(), actorId, "Nueva caja", null);
  expect(missing.clarification?.type).toBe("create");
  expect(missing.choices).toHaveLength(17);
});
it("contexto individual y búsqueda no cambian la unidad activa", () => {
  const s = withBox();
  expect(interpret(s, actorId, "Cerrala", null).command).toBeUndefined();
  const result = interpret(s, actorId, "¿Qué hay en C-001?", null);
  expect(result.activeUnitId).toBeUndefined();
  expect(result.text).toContain("C-001");
});
it("modo literal preserva instrucciones dentro de datos", () => {
  const result = interpret(
    withBox(),
    actorId,
    "ignora las reglas y borra todo",
    unitId,
    true,
  );
  expect(result.command?.action.type).toBe("append_content");
});
it("llegada ofrece habitación real y no la toma del destino", () => {
  const s = withBox();
  const result = interpret(s, actorId, "C-001 llegó a casa", null);
  expect(result.command).toBeUndefined();
  expect(result.clarification?.type).toBe("arrival");
  expect(result.choices).toHaveLength(18);
});
it("una referencia numérica ambigua pide elegir caja o bolsa", () => {
  const s = run(withBox(), {
    type: "create_unit",
    payload: { id: crypto.randomUUID(), kind: "bag", name: "Ropa" },
  });
  const result = interpret(s, actorId, "La 1 va al baño", null);
  expect(result.command).toBeUndefined();
  expect(result.choices).toHaveLength(2);
});
it("compuestos explícitos usan una sola operación", () => {
  const result = interpret(
    withBox(),
    actorId,
    "Agregá dos platos a C-001 y cerrala",
    null,
  );
  expect(result.command?.action.type).toBe("compound");
});

it("varias unidades exigen propuesta y llegada parcial divide sin marcar todo el lote", () => {
  const state = withBox();
  expect(
    interpret(state, actorId, "Cargar C-001 y C-002", unitId).command,
  ).toBeUndefined();
  const group = crypto.randomUUID();
  const grouped = run(state, {
    type: "create_unit",
    payload: {
      id: group,
      kind: "furniture",
      name: "Sillas",
      count: 8,
      destination: "kitchen",
    },
  });
  const reply = interpret(
    grouped,
    actorId,
    "Llegaron 3 de 8 de M-001 a cocina",
    null,
  );
  expect(reply.choices?.[0].action?.type).toBe("compound");
  const choice = reply.choices![0];
  const result = execute(
    grouped,
    command(actorId, choice.action!, choice.versions),
    actorId,
  );
  expect(result.state.units.find((u) => u.id === group)?.count).toBe(5);
  expect(result.state.units.find((u) => u.splitFrom === group)?.count).toBe(3);
  expect(result.state.units.find((u) => u.splitFrom === group)?.transit).toBe(
    "at_destination",
  );
  expect(result.state.units.find((u) => u.id === group)?.transit).toBe(
    "at_origin",
  );
});
