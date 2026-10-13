import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { command } from "../src/domain/commands";
import {
  acknowledge,
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
