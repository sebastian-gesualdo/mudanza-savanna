import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { command, execute } from "../src/domain/commands";
import {
  acknowledge,
  applyDelta,
  editDocument,
  enqueue,
  loadDocument,
  markConflict,
  offlineExport,
  project,
} from "../src/offline/store";
import { actorId, withBox, unitId } from "./fixtures";
it("conserva cola y borrador tras reabrir y separa propietarios", async () => {
  const state = withBox();
  const owner = crypto.randomUUID();
  await loadDocument(owner, state);
  const c = command(actorId, {
    type: "append_content",
    payload: { id: crypto.randomUUID(), unitId, description: "Pava eléctrica" },
  });
  await editDocument(owner, (doc) => {
    doc.draft = "Borrador sin enviar";
    enqueue(doc, c);
  });
  const reload = await loadDocument(owner, state);
  expect(reload.queue).toHaveLength(1);
  expect(reload.draft).toBe("Borrador sin enviar");
  expect(project(reload).entries).toHaveLength(1);
  expect(reload.confirmed.entries).toHaveLength(0);
  const other = await loadDocument(crypto.randomUUID(), state);
  expect(other.queue).toHaveLength(0);
  expect(offlineExport(reload).format).toBe("gesualdo-local-pending");
});
it("recibo y remoción de cola se persisten juntos; un reintento no duplica", async () => {
  const s = withBox();
  const owner = crypto.randomUUID();
  await loadDocument(owner, s);
  const c = command(actorId, {
    type: "append_content",
    payload: { id: crypto.randomUUID(), unitId, description: "Pava" },
  });
  const local = await editDocument(owner, (d) => enqueue(d, c));
  const receipt = project(local).receipts[c.operationId].receipt;
  await acknowledge(owner, receipt);
  await acknowledge(owner, receipt);
  const reloaded = await loadDocument(owner, s);
  expect(reloaded.queue).toHaveLength(0);
  expect(reloaded.confirmed.entries).toHaveLength(1);
});
it("conflicto preserva el texto original sin proyectarlo como confirmado", async () => {
  const s = withBox();
  const owner = crypto.randomUUID();
  await loadDocument(owner, s);
  const c = command(actorId, {
    type: "append_content",
    payload: {
      id: crypto.randomUUID(),
      unitId,
      description: "Pava no confirmada",
    },
  });
  await editDocument(owner, (d) => enqueue(d, c));
  const doc = await markConflict(
    owner,
    c.operationId,
    "Otra persona cerró la caja.",
  );
  expect(project(doc).entries).toHaveLength(0);
  expect(JSON.stringify(doc.queue)).toContain("Pava no confirmada");
  expect(doc.queue[0].status).toBe("review");
});

it("un recibo adelantado no saltea cambios ajenos; el cursor se guarda con la página completa", async () => {
  const state = withBox();
  const owner = crypto.randomUUID();
  await loadDocument(owner, state);
  const foreign = execute(
    state,
    command(actorId, {
      type: "append_content",
      payload: { id: crypto.randomUUID(), unitId, description: "Cambio ajeno" },
    }),
    actorId,
  );
  const own = execute(
    foreign.state,
    command(actorId, {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId,
        description: "Cambio propio",
      },
    }),
    actorId,
  );
  await acknowledge(owner, own.receipt);
  const ahead = await loadDocument(owner, state);
  expect(ahead.syncedRevision).toBe(state.revision);
  expect(ahead.confirmed.revision).toBe(own.receipt.revision);
  const delta = {
    events: own.state.events.filter((e) => e.revision > state.revision),
    nextCursor: own.receipt.revision,
    hasMore: false,
    headRevision: own.receipt.revision,
    counters: own.state.counters,
  };
  await editDocument(owner, (d) => applyDelta(d, delta));
  const saved = await loadDocument(owner, state);
  expect(saved.confirmed.entries).toHaveLength(2);
  expect(saved.syncedRevision).toBe(own.receipt.revision);
});
it("una página incompleta aborta la transacción IndexedDB y no adelanta cursor", async () => {
  const state = withBox();
  const owner = crypto.randomUUID();
  await loadDocument(owner, state);
  const next = execute(
    state,
    command(actorId, {
      type: "append_content",
      payload: {
        id: crypto.randomUUID(),
        unitId,
        description: "Nunca parcial",
      },
    }),
    actorId,
  );
  await expect(
    editDocument(owner, (d) =>
      applyDelta(d, {
        events: [next.state.events.at(-1)!],
        nextCursor: next.receipt.revision + 1,
        hasMore: true,
        headRevision: next.receipt.revision + 1,
        counters: next.state.counters,
      }),
    ),
  ).rejects.toThrow();
  const saved = await loadDocument(owner, state);
  expect(saved.syncedRevision).toBe(state.revision);
  expect(saved.confirmed.entries).toHaveLength(0);
});
