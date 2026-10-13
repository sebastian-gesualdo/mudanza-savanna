import { openDB } from "idb";
import { Clarification, Choice } from "../domain/chat";
import { Command, execute } from "../domain/commands";
import { Change, DomainError, Kind, Receipt, State } from "../domain/model";
import { SearchHit } from "../domain/search";
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  status?: string;
  receipt?: Receipt;
  choices?: Choice[];
  hits?: SearchHit[];
  operationId?: string;
  expiresAt?: string;
  request?: ChatRequest;
  replyId?: string;
}
export interface ChatRequest {
  messageId: string;
  conversationId: string;
  expectedParticipantId: string;
  text: string;
  activeUnitId: string | null;
  literal: boolean;
  clarification?: Clarification;
  structuredCommand?: Command;
  deviceId: string;
}
export interface Pending {
  command: Command;
  at: string;
  status: "pending" | "review";
  error?: string;
  entityIds: string[];
  message?: ChatRequest;
}
export interface LocalDocument {
  owner: string;
  confirmed: State;
  queue: Pending[];
  messages: Message[];
  activeUnitId: string | null;
  literal: boolean;
  clarification?: Clarification;
  draft: string;
  conversationId: string;
  deviceId: string;
  conversationVersion: number;
  labels: Record<Kind, string[]>;
  lastSync: string | null;
  reservationRequests?: Partial<
    Record<Kind, { operationId: string; count: number }>
  >;
}
const open = () =>
  openDB("gesualdo-v1", 1, {
    upgrade(db) {
      db.createObjectStore("documents", { keyPath: "owner" });
      db.createObjectStore("meta");
    },
  });
export async function meta<T>(key: string, value?: T): Promise<T | undefined> {
  const db = await open();
  if (arguments.length === 2) await db.put("meta", value, key);
  const result = await db.get("meta", key);
  db.close();
  return result as T | undefined;
}
export async function loadDocument(
  owner: string,
  state: State,
): Promise<LocalDocument> {
  const db = await open();
  const tx = db.transaction(["documents", "meta"], "readwrite");
  let doc = (await tx.objectStore("documents").get(owner)) as
    | LocalDocument
    | undefined;
  let deviceId = (await tx.objectStore("meta").get("device")) as
    | string
    | undefined;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await tx.objectStore("meta").put(deviceId, "device");
  }
  if (!doc) {
    doc = {
      owner,
      confirmed: state,
      queue: [],
      messages: [],
      activeUnitId: null,
      literal: false,
      draft: "",
      conversationId: crypto.randomUUID(),
      conversationVersion: 1,
      deviceId,
      labels: { box: [], bag: [], furniture: [], other: [] },
      lastSync: null,
    };
    await tx.objectStore("documents").put(doc);
  }
  await tx.done;
  db.close();
  return doc;
}
export async function editDocument(
  owner: string,
  edit: (doc: LocalDocument) => void,
): Promise<LocalDocument> {
  const db = await open();
  const tx = db.transaction("documents", "readwrite");
  const doc = (await tx.store.get(owner)) as LocalDocument | undefined;
  if (!doc) throw new Error("Local document missing");
  edit(doc);
  await tx.store.put(doc);
  await tx.done;
  db.close();
  return doc;
}
export function touched(command: Command) {
  const actions =
    command.action.type === "compound"
      ? command.action.payload.actions
      : [command.action];
  return [
    ...new Set([
      ...Object.keys(command.expectedVersions ?? {}),
      ...actions.flatMap((a) =>
        Object.entries(a.payload)
          .filter(([key]) =>
            /^(unitId|entryId|targetUnitId|id|linkId)$/.test(key),
          )
          .map(([, value]) => value as string),
      ),
    ]),
  ];
}
export function project(doc: LocalDocument) {
  let state = doc.confirmed;
  const blocked = new Set<string>();
  for (const item of doc.queue) {
    if (
      item.status === "review" ||
      item.entityIds.some((id) => blocked.has(id))
    ) {
      item.entityIds.forEach((id) => blocked.add(id));
      continue;
    }
    try {
      state = execute(
        state,
        item.command,
        item.command.expectedParticipantId,
        item.at,
      ).state;
    } catch {
      item.entityIds.forEach((id) => blocked.add(id));
    }
  }
  return state;
}
export function enqueue(doc: LocalDocument, c: Command) {
  if (doc.queue.some((p) => p.command.operationId === c.operationId)) return;
  const actions =
    c.action.type === "compound" ? c.action.payload.actions : [c.action];
  for (const a of actions)
    if (
      a.type === "create_unit" &&
      !a.payload.code &&
      doc.labels[a.payload.kind].length
    )
      a.payload.code = doc.labels[a.payload.kind].shift();
  // Validate projection before storing; it never becomes a shared receipt.
  execute(project(doc), c, c.expectedParticipantId);
  doc.queue.push({
    command: c,
    at: new Date().toISOString(),
    status: "pending",
    entityIds: touched(c),
  });
}
export function applyReceipt(state: State, receipt: Receipt) {
  for (const change of receipt.changes) applyChange(state, change);
  state.revision = Math.max(state.revision, receipt.revision);
}
export function applyChange(state: State, change: Change) {
  const list = state[change.collection] as Change["after"][];
  const index = list.findIndex((e) => e.id === change.id);
  if (index < 0) list.push(change.after);
  else if (list[index].version <= change.after.version)
    list[index] = change.after;
}
export async function acknowledge(owner: string, receipt: Receipt) {
  return editDocument(owner, (doc) => {
    applyReceipt(doc.confirmed, receipt);
    doc.queue = doc.queue.filter(
      (p) => p.command.operationId !== receipt.operationId,
    );
    doc.lastSync = receipt.at;
    for (const m of doc.messages)
      if (m.operationId === receipt.operationId) {
        m.status = "Guardado";
        m.receipt = receipt;
        m.text = receipt.summary;
      }
  });
}
export async function markConflict(
  owner: string,
  operationId: string,
  error: string,
) {
  return editDocument(owner, (doc) => {
    const item = doc.queue.find((p) => p.command.operationId === operationId);
    if (item) {
      item.status = "review";
      item.error = error;
    }
    for (const m of doc.messages)
      if (m.operationId === operationId) m.status = "Requiere revisión";
  });
}
export function offlineExport(doc: LocalDocument) {
  return {
    format: "gesualdo-local-pending",
    schema_version: 1,
    exported_at: new Date().toISOString(),
    confirmed_revision: doc.confirmed.revision,
    confirmed_snapshot: doc.confirmed,
    pending_commands: doc.queue,
    messages: doc.messages,
    draft: doc.draft,
  };
}
export async function withSyncLock<T>(owner: string, run: () => Promise<T>) {
  // Supported by current Safari; IndexedDB transactions still serialize local edits.
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(
      `sync:${owner}`,
      { ifAvailable: true },
      (lock) => (lock ? run() : undefined),
    );
  throw new DomainError(
    "LOCK_UNAVAILABLE",
    "Este navegador no permite coordinar pendientes entre pestañas. Usá una sola pestaña actualizada.",
    503,
  );
}
