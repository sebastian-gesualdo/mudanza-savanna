import { describe, expect, it } from "vitest";
import { command, execute, versionsFor } from "../src/domain/commands";
import { contents, roomName, rooms } from "../src/domain/model";
import { search } from "../src/domain/search";
import { backupSchema, exportInventory, unitsCsv } from "../src/server/backup";
import {
  actorId,
  secondActor,
  makeState,
  run,
  unitId,
  withBox,
} from "./fixtures";

describe("Integridad del inventario", () => {
  it("tolera un error de escritura y distingue una zapatilla eléctrica del calzado", () => {
    let s = run(withBox(), {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId,
        description: "Pava eléctrica",
      },
    });
    s = run(s, {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId,
        description: "Zapatilla eléctrica",
      },
    });
    s = run(s, {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId,
        description: "Zapatos y zapatillas",
      },
    });
    expect(search(s, "pava electrca")[0].evidence).toBe("Pava eléctrica");
    expect(search(s, "pava electrca")[0].approximate).toBe(true);
    expect(search(s, "power strip").map((h) => h.evidence)).toEqual([
      "Zapatilla eléctrica",
    ]);
  });
  it("comienza vacío con 17 ambientes y cantidades desconocidas", () => {
    expect(makeState().units).toEqual([]);
    expect(rooms).toHaveLength(17);
    expect(roomName(null)).toBe("Sin asignar");
  });
  it("mantiene contenido literal, autor de cierre y reabre explícitamente", () => {
    let s = withBox();
    const id = crypto.randomUUID();
    s = run(s, {
      type: "append_content",
      payload: {
        id,
        unitId,
        description: "Seis platos, cuatro bowls y la fuente azul",
      },
    });
    expect(s.entries[0].quantity).toBeNull();
    s = run(
      s,
      { type: "close_unit", payload: { unitId } },
      [unitId],
      secondActor,
    );
    expect(s.units[0].closedBy).toBe(secondActor);
    expect(() =>
      run(s, {
        type: "append_content",
        payload: { id: crypto.randomUUID(), unitId, description: "Pava" },
      }),
    ).toThrow("reabrí");
    s = run(s, { type: "reopen_unit", payload: { unitId } }, [unitId]);
    expect(s.units[0].closedAt).toBeNull();
    expect(s.events.some((e) => e.actorId === secondActor)).toBe(true);
  });
  it("exige destino y contenido o una declaración de vacío", () => {
    expect(() =>
      run(
        withBox(null),
        { type: "close_unit", payload: { unitId, declaredEmpty: true } },
        [unitId],
      ),
    ).toThrow("ambiente");
    expect(() =>
      run(withBox(), { type: "close_unit", payload: { unitId } }, [unitId]),
    ).toThrow("contenido");
    expect(
      run(
        withBox(),
        { type: "close_unit", payload: { unitId, declaredEmpty: true } },
        [unitId],
      ).units[0].packing,
    ).toBe("closed");
  });
  it("recupera el mismo recibo sin duplicar y rechaza reutilizar UUID con otro payload", () => {
    const s = withBox();
    const c = command(actorId, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "Pava" },
    });
    const first = execute(s, c, actorId);
    const retry = execute(first.state, c, actorId);
    expect(retry.receipt).toEqual(first.receipt);
    expect(retry.state.entries).toHaveLength(1);
    expect(() =>
      execute(
        first.state,
        { ...c, action: { type: "reopen_unit", payload: { unitId } } },
        actorId,
      ),
    ).toThrow("otros datos");
  });
  it("rechaza actor esperado ajeno incluso al recuperar un recibo", () => {
    const c = command(actorId, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "Pava" },
    });
    expect(() => execute(withBox(), c, secondActor)).toThrow("cuenta");
  });
  it("un compuesto falla completo si el cierre no puede ejecutarse", () => {
    const s = withBox(null);
    const c = command(
      actorId,
      {
        type: "compound",
        payload: {
          actions: [
            {
              type: "append_content",
              payload: { id: crypto.randomUUID(), unitId, description: "Pava" },
            },
            { type: "close_unit", payload: { unitId } },
          ],
        },
      },
      versionsFor(s, [unitId]),
    );
    expect(() => execute(s, c, actorId)).toThrow();
    expect(s.entries).toHaveLength(0);
    expect(s.units[0].version).toBe(1);
  });
  it("versiones obsoletas no pisan cambios y adiciones independientes coexisten", () => {
    const s = withBox();
    const c = command(
      actorId,
      {
        type: "update_unit",
        payload: { unitId, patch: { destination: "office" } },
      },
      versionsFor(s, [unitId]),
    );
    let next = run(s, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "A" },
    });
    next = run(next, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "B" },
    });
    expect(contents(next, unitId)).toHaveLength(2);
    expect(() => execute(next, c, actorId)).toThrow("Cambió");
  });
  it("llegada directa no inventa habitación y desempaque conserva búsqueda histórica", () => {
    let s = run(withBox(), {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId,
        description: "Pava eléctrica",
      },
    });
    s = run(s, { type: "close_unit", payload: { unitId } }, [unitId]);
    s = run(
      s,
      {
        type: "set_transit_state",
        payload: { unitId, state: "at_destination" },
      },
      [unitId],
    );
    expect(s.units[0].actualRoom).toBeNull();
    expect(search(s, "hervidor")[0].historical).toBe(false);
    s = run(
      s,
      { type: "set_unpack_state", payload: { unitId, state: "done" } },
      [unitId],
    );
    expect(contents(s, unitId)).toHaveLength(0);
    expect(search(s, "hervidor")[0].historical).toBe(true);
    expect(search(s, "hervidor")[0].whereabouts).toContain("no se registró");
  });
  it("transferencia es atómica y mueve la ubicación sin duplicar", () => {
    const other = crypto.randomUUID();
    const entry = crypto.randomUUID();
    let s = run(withBox(), {
      type: "create_unit",
      payload: { id: other, kind: "bag", name: "Bolsa", destination: "office" },
    });
    s = run(s, {
      type: "append_content",
      payload: { id: entry, unitId, description: "Documentos" },
    });
    s = run(
      s,
      {
        type: "transfer_content",
        payload: { entryId: entry, targetUnitId: other },
      },
      [unitId, other, entry],
    );
    expect(contents(s, unitId)).toHaveLength(0);
    expect(contents(s, other)).toHaveLength(1);
    expect(s.entries).toHaveLength(1);
  });
  it("dividir lote conserva cantidad y códigos de unidades archivadas no se reciclan", () => {
    const id = crypto.randomUUID();
    let s = run(makeState(), {
      type: "create_unit",
      payload: { id, kind: "furniture", name: "Sillas", count: 8 },
    });
    s = run(
      s,
      {
        type: "split_unit_group",
        payload: {
          unitId: id,
          id: crypto.randomUUID(),
          count: 3,
          destination: "office",
        },
      },
      [id],
    );
    expect(s.units.reduce((n, u) => n + u.count, 0)).toBe(8);
    expect(s.units.map((u) => u.count)).toEqual([5, 3]);
    s = run(s, { type: "archive_unit", payload: { unitId: id } }, [id]);
    s = run(s, {
      type: "create_unit",
      payload: { id: crypto.randomUUID(), kind: "furniture", name: "Mesa" },
    });
    expect(s.units[2].code).toBe("M-003");
  });
  it("deshacer compensa y rechaza cambios posteriores incompatibles", () => {
    let s = run(withBox(), {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "Pava" },
    });
    const event = s.events.at(-1)!;
    const undo = run(
      s,
      { type: "undo_event", payload: { eventId: event.id } },
      event.changes.map((c) => c.id),
    );
    expect(undo.events).toHaveLength(s.events.length + 1);
    expect(contents(undo, unitId)).toHaveLength(0);
    s = run(
      s,
      {
        type: "update_unit",
        payload: { unitId, patch: { notes: "Cambio posterior" } },
      },
      [unitId],
    );
    expect(() =>
      run(
        s,
        { type: "undo_event", payload: { eventId: event.id } },
        event.changes.map((c) => c.id),
      ),
    ).toThrow("posteriores");
  });
  it("importación idempotente por procedencia, sin estados históricos", () => {
    const action = {
      type: "create_unit" as const,
      payload: {
        id: crypto.randomUUID(),
        kind: "furniture" as const,
        name: "Mesa",
        provenance: { source: "fixture", row: 42, comment: "Original" },
      },
    };
    const s = run(makeState(), action);
    expect(s.units[0].transit).toBe("at_origin");
    expect(() =>
      run(s, {
        ...action,
        payload: { ...action.payload, id: crypto.randomUUID() },
      }),
    ).toThrow("importada");
  });
  it("exporta sin membresías ni tokens y neutraliza fórmulas CSV", () => {
    const s = run(makeState(), {
      type: "create_unit",
      payload: { id: unitId, kind: "other", name: '=HYPERLINK("bad")' },
    });
    const backup = exportInventory(s);
    expect(backupSchema.parse(backup).units).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toMatch(
      /auth_user|membership|token|password/,
    );
    expect(unitsCsv(s)).toContain("'=HYPERLINK");
  });
});

it("dividir contenido conserva relaciones en ambas partes", () => {
  let state = withBox();
  const entry = crypto.randomUUID();
  const furniture = crypto.randomUUID();
  state = run(state, {
    type: "append_content",
    payload: {
      id: entry,
      unitId,
      description: "Tornillos del escritorio",
      quantity: 8,
    },
  });
  state = run(state, {
    type: "create_unit",
    payload: { id: furniture, kind: "furniture", name: "Escritorio" },
  });
  state = run(
    state,
    {
      type: "link_accessory",
      payload: {
        id: crypto.randomUUID(),
        entryId: entry,
        unitId: furniture,
        relation: "screws",
      },
    },
    [entry, furniture],
  );
  const part = crypto.randomUUID();
  state = run(
    state,
    {
      type: "split_content",
      payload: {
        entryId: entry,
        id: part,
        quantity: 3,
        description: "Tornillos separados",
      },
    },
    [entry, unitId],
  );
  expect(state.links.filter((l) => l.unitId === furniture)).toHaveLength(2);
  expect(state.entries.find((e) => e.id === part)?.original).toBe(
    "Tornillos del escritorio",
  );
  expect(state.entries.reduce((sum, e) => sum + (e.quantity ?? 0), 0)).toBe(8);
});
