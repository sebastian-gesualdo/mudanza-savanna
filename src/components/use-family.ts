"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Command, execute } from "../domain/commands";
import { ChatReply, Choice, interpret } from "../domain/chat";
import { DomainError, emptyState, Receipt, State } from "../domain/model";
import {
  acknowledge,
  applyDelta,
  applyReceipt,
  Delta,
  editDocument,
  enqueue,
  loadDocument,
  LocalDocument,
  markConflict,
  Message,
  meta,
  project,
  withSyncLock,
} from "../offline/store";

export interface Session {
  demo: boolean;
  owner: string;
  actorId: string;
  userId: string;
  email: string;
  moveId: string;
}
const demoActor = "00000000-0000-4000-8000-000000000001";
const demoMove = "00000000-0000-4000-8000-000000000002";
export async function api<T>(
  path: string,
  payload?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: payload === undefined ? "GET" : method,
    credentials: "same-origin",
    cache: "no-store",
    ...(payload === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
    signal: AbortSignal.timeout(
      path.startsWith("chat/messages") || path === "ai/check" ? 70000 : 20000,
    ),
  });
  const b = await response.json();
  if (!response.ok)
    throw new DomainError(
      b.code ?? "UNAVAILABLE",
      b.message ?? "No se pudo confirmar el cambio.",
      response.status,
    );
  return b;
}
export function useFamily(
  environment: string,
  demoAllowed: boolean,
  configured: boolean,
) {
  const [session, setSession] = useState<Session | null>(null);
  const [doc, setDoc] = useState<LocalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const sending = useRef(false);
  const submitting = useRef(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const channel = useRef<BroadcastChannel | null>(null);
  const stopped = useRef(false);
  const write = useCallback(
    async (edit: (d: LocalDocument) => void) => {
      if (!session) throw new Error("Missing session");
      const next = await editDocument(session.owner, edit);
      docRef.current = next;
      setDoc(next);
      channel.current?.postMessage(session.owner);
      return next;
    },
    [session],
  );
  const enter = useCallback(async (s: Session, state: State) => {
    const local = await loadDocument(s.owner, state);
    setSession(s);
    docRef.current = local;
    setDoc(local);
    await meta("activeSession", s);
    stopped.current = false;
  }, []);
  const startDemo = async () => {
    try {
      await enter(
        {
          demo: true,
          owner: `${environment}:demo:${demoActor}`,
          actorId: demoActor,
          userId: demoActor,
          email: "Cuenta de ejemplo · solo este dispositivo",
          moveId: demoMove,
        },
        emptyState(demoMove, [{ id: demoActor, nickname: "Seba", version: 1 }]),
      );
    } catch {
      setError(
        "No se pudo abrir el almacenamiento local. Revisá los permisos del navegador.",
      );
    }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOnline(navigator.onLine);
      try {
        const pendingLogout = await meta<boolean>("pendingSignout");
        if (pendingLogout) {
          if (navigator.onLine) {
            await api("auth/signout", {});
            await meta("pendingSignout", false);
          }
          return;
        }
        const saved = await meta<Session | null>("activeSession");
        if (saved?.demo && demoAllowed) {
          if (!cancelled)
            await enter(
              saved,
              emptyState(saved.moveId, [
                { id: saved.actorId, nickname: "Seba", version: 1 },
              ]),
            );
          return;
        }
        if (!configured) return;
        if (!navigator.onLine && saved && !saved.demo) {
          const local = await loadDocument(
            saved.owner,
            emptyState(saved.moveId, []),
          );
          if (!cancelled) {
            setSession(saved);
            setDoc(local);
          }
          return;
        }
        const boot = await api<{
          account: { userId: string; email: string };
          participant: { id: string };
          move: { id: string };
        }>("bootstrap");
        const state = await api<State>("inventory/snapshot");
        if (!cancelled)
          await enter(
            {
              demo: false,
              owner: `${environment}:${boot.move.id}:${boot.account.userId}`,
              actorId: boot.participant.id,
              userId: boot.account.userId,
              email: boot.account.email,
              moveId: boot.move.id,
            },
            state,
          );
      } catch (e) {
        if (!(e instanceof DomainError && e.status === 401))
          setError(e instanceof Error ? e.message : "No se pudo iniciar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, demoAllowed, enter, environment]);
  const sync = useCallback(async () => {
    const d = docRef.current;
    if (!session || session.demo || !d || !navigator.onLine || stopped.current)
      return;
    try {
      await withSyncLock(session.owner, async () => {
        setBusy(true);
        const boot = await api<{
          account: { userId: string };
          participant: { id: string };
          move: { id: string };
        }>("bootstrap");
        if (
          boot.account.userId !== session.userId ||
          boot.participant.id !== session.actorId ||
          boot.move.id !== session.moveId
        ) {
          stopped.current = true;
          setDoc(null);
          setSession(null);
          await meta("activeSession", null);
          throw new DomainError(
            "ACTOR_MISMATCH",
            "La cuenta cambió. Volvé a ingresar; los pendientes quedan en su cuenta original.",
            409,
          );
        }
        const conversation = await api<{
          version: number;
          active_unit_id: string | null;
        }>("conversations", { id: d.conversationId, deviceId: d.deviceId });
        const latest = await editDocument(session.owner, () => {});
        const blocked = new Set<string>();
        for (const pending of latest.queue) {
          if (
            pending.status === "review" ||
            pending.entityIds.some((id) => blocked.has(id))
          ) {
            pending.entityIds.forEach((id) => blocked.add(id));
            continue;
          }
          try {
            const result = pending.message
              ? await api<{ receipt: Message["receipt"] }>(
                  "chat/messages",
                  pending.message,
                )
              : await api<{ receipt: Message["receipt"] }>("commands", {
                  command: pending.command,
                  deviceId: latest.deviceId,
                });
            if (result.receipt) {
              const next = await acknowledge(session.owner, result.receipt);
              docRef.current = next;
              setDoc(next);
            }
          } catch (e) {
            if (
              e instanceof DomainError &&
              [409, 422, 400, 404].includes(e.status)
            ) {
              pending.entityIds.forEach((id) => blocked.add(id));
              setDoc(
                await markConflict(
                  session.owner,
                  pending.command.operationId,
                  e.message,
                ),
              );
            } else throw e;
          }
        }
        for (const message of (
          await editDocument(session.owner, () => {})
        ).messages.filter((m) => m.request)) {
          try {
            const result = await api<ChatReply & { receipt?: Receipt }>(
              "chat/messages",
              message.request,
            );
            if (result.processing) continue;
            await write((local) => {
              const original = local.messages.find((m) => m.id === message.id);
              if (original) {
                original.request = undefined;
                original.status = undefined;
              }
              const response = local.messages.find(
                (m) => m.id === message.replyId,
              );
              if (response) {
                response.text = result.text;
                local.clarification = result.clarification;
                response.hits = result.hits;
                response.choices = result.choices;
                response.expiresAt = result.expiresAt;

                if (result.activeUnitId)
                  local.activeUnitId = result.activeUnitId;
                if (result.literal !== undefined)
                  local.literal = result.literal;
                response.receipt = result.receipt;
                response.status = result.receipt
                  ? "Guardado"
                  : "Consulta confirmada";
              }
            });
          } catch (e) {
            if (
              e instanceof DomainError &&
              [400, 404, 409, 422].includes(e.status)
            )
              await write((local) => {
                const original = local.messages.find(
                  (m) => m.id === message.id,
                );
                if (original) {
                  original.status = "Requiere revisión";
                  original.request = undefined;
                }
              });
            else throw e;
          }
        }
        for (const resolution of (await editDocument(session.owner, () => {}))
          .resolutions ?? []) {
          if (resolution.status) continue;
          try {
            const { receipt } = await api<{ receipt: Receipt }>(
              `chat/messages/${resolution.messageId}/resolve`,
              {
                operationId: resolution.operationId,
                choiceIndex: resolution.choiceIndex,
                expectedParticipantId: resolution.expectedParticipantId,
                deviceId: resolution.deviceId,
              },
            );
            await write((local) => {
              applyReceipt(local.confirmed, receipt);
              local.resolutions = local.resolutions?.filter(
                (r) => r.operationId !== resolution.operationId,
              );
              if (resolution.activeAfter) {
                local.activeUnitId = resolution.activeAfter;
                local.literal = resolution.literalAfter ?? false;
              }
              local.messages.push({
                id: receipt.eventId,
                role: "assistant",
                text: receipt.summary,
                at: receipt.at,
                status: "Guardado",
                receipt,
              });
            });
          } catch (e) {
            if (
              e instanceof DomainError &&
              [400, 404, 409, 422].includes(e.status)
            )
              await write((local) => {
                const r = local.resolutions?.find(
                  (r) => r.operationId === resolution.operationId,
                );
                if (r) r.status = e.message;
              });
            else throw e;
          }
        }
        // Own receipts may be ahead of this cursor. Recover every intervening shared event.
        for (let page = 0; page < 20; page++) {
          const local = await editDocument(session.owner, () => {});
          const delta = await api<Delta>(
            `sync?after=${local.syncedRevision ?? 0}&limit=100`,
          );
          await write((doc) => applyDelta(doc, delta));
          if (!delta.hasMore) break;
        }
        const snapshot = (await editDocument(session.owner, () => {}))
          .confirmed;
        const currentContext = (await editDocument(session.owner, () => {}))
          .activeUnitId;
        if (
          currentContext !== conversation.active_unit_id &&
          (!currentContext ||
            snapshot.units.some((u) => u.id === currentContext))
        ) {
          const result = await api<{ version: number }>(
            `conversations/${d.conversationId}/context`,
            {
              activeUnitId: currentContext,
              expectedVersion: conversation.version,
              expectedParticipantId: session.actorId,
            },
            "PATCH",
          );
          await write((local) => {
            local.conversationVersion = result.version;
          });
        }
        for (const kind of ["box", "bag", "furniture", "other"] as const) {
          const prepared = await write((local) => {
            if (local.labels[kind].length >= 3) return;
            local.reservationRequests ??= {};
            local.reservationRequests[kind] ??= {
              operationId: crypto.randomUUID(),
              count: kind === "box" ? 10 : 5,
            };
          });
          const request = prepared.reservationRequests?.[kind];
          if (!request) continue;
          const result = await api<{ codes: string[] }>("labels/reserve", {
            ...request,
            kind,
            deviceId: prepared.deviceId,
            expectedParticipantId: session.actorId,
          });
          await write((local) => {
            local.labels[kind] = [
              ...new Set([...local.labels[kind], ...result.codes]),
            ];
            delete local.reservationRequests?.[kind];
          });
        }
        setError("");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sincronizar.");
      if (e instanceof DomainError && [401, 403].includes(e.status))
        stopped.current = true;
    } finally {
      setBusy(false);
    }
  }, [session, write]);
  useEffect(() => {
    if (!session) return;
    channel.current = new BroadcastChannel("gesualdo");
    channel.current.onmessage = (e) => {
      if (e.data === session.owner)
        editDocument(session.owner, () => {})
          .then((next) => {
            docRef.current = next;
            setDoc(next);
          })
          .catch(() => setError("No se pudo leer la copia local."));
    };
    const refresh = () => {
      setOnline(navigator.onLine);
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 10000);
    void sync();
    return () => {
      channel.current?.close();
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, sync]);
  const submit = async (c: Command, text?: string) => {
    if (!session) return;
    if (submitting.current)
      throw new DomainError(
        "BUSY",
        "Esperá a que termine el cambio anterior.",
        409,
      );
    submitting.current = true;
    setMutating(true);
    setError("");
    try {
      await write((d) => {
        const now = new Date().toISOString();
        if (text)
          d.messages.push({ id: c.operationId, role: "user", text, at: now });
        if (session.demo) {
          const result = execute(d.confirmed, c, session.actorId);
          d.confirmed = result.state;
          d.messages.push({
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.receipt.summary,
            receipt: result.receipt,
            at: now,
            status: "Guardado en demo local",
          });
        } else {
          enqueue(d, c);
          if (text)
            d.queue.find(
              (p) => p.command.operationId === c.operationId,
            )!.message = {
              messageId: c.operationId,
              conversationId: d.conversationId,
              expectedParticipantId: session.actorId,
              text,
              activeUnitId: d.activeUnitId,
              literal: d.literal,
              clarification: d.clarification,
              structuredCommand: c,
              deviceId: d.deviceId,
            };
          d.messages.push({
            id: crypto.randomUUID(),
            role: "assistant",
            text: "Cambio conservado en este dispositivo. Los demás todavía no lo ven.",
            at: now,
            status: "Pendiente de sincronizar",
            operationId: c.operationId,
          });
        }
      });
      void sync();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el pendiente.",
      );
      throw e;
    } finally {
      submitting.current = false;
      setMutating(false);
    }
  };
  const send = async (text: string) => {
    if (!session || !docRef.current) return;
    if (sending.current)
      throw new DomainError(
        "BUSY",
        "Esperá a que termine el mensaje anterior.",
        409,
      );
    sending.current = true;
    setMutating(true);
    try {
      const d = docRef.current;
      const state = project(d);
      const reply = interpret(
        state,
        session.actorId,
        text,
        d.activeUnitId,
        d.literal,
        d.clarification,
      );
      if (reply.command) await submit(reply.command, text);
      else
        await write((local) => {
          const at = new Date().toISOString();
          const messageId = crypto.randomUUID();
          const replyId = crypto.randomUUID();
          local.messages.push(
            {
              id: messageId,
              role: "user",
              text,
              at,
              ...(!session.demo
                ? {
                    replyId,
                    request: {
                      messageId,
                      conversationId: local.conversationId,
                      expectedParticipantId: session.actorId,
                      text,
                      activeUnitId: local.activeUnitId,
                      literal: local.literal,
                      clarification: local.clarification,
                      deviceId: local.deviceId,
                    },
                  }
                : {}),
            },
            {
              id: replyId,
              role: "assistant",
              text: reply.text,
              at,
              hits: reply.hits,
              choices: reply.choices,
              ...(!session.demo
                ? {
                    status: reply.hits
                      ? "Consulta en copia local"
                      : "Pendiente de interpretar",
                  }
                : {}),
              expiresAt: new Date(Date.now() + 600000).toISOString(),
            },
          );
        });
      await write((local) => {
        local.draft = "";
        local.clarification = reply.clarification;
        if (reply.activeUnitId) local.activeUnitId = reply.activeUnitId;
        if (reply.literal !== undefined) local.literal = reply.literal;
      });
      void sync();
    } finally {
      sending.current = false;
      setMutating(false);
    }
  };
  const choose = async (choice: Choice, expiresAt?: string) => {
    if (choice.action && expiresAt && Date.parse(expiresAt) < Date.now())
      throw new DomainError(
        "PROPOSAL_EXPIRED",
        "Esta propuesta venció. Repetí el pedido para revisar los datos actuales.",
        409,
      );
    if (choice.proposal && session && !session.demo) {
      await write((local) => {
        local.resolutions ??= [];
        if (
          !local.resolutions.some(
            (r) =>
              r.messageId === choice.proposal!.messageId &&
              r.choiceIndex === choice.proposal!.choiceIndex,
          )
        ) {
          const action = choice.action!;
          const actions =
            action.type === "compound" ? action.payload.actions : [action];
          const created = actions
            .filter((a) => a.type === "create_unit")
            .at(-1);
          local.resolutions.push({
            ...choice.proposal!,
            operationId: crypto.randomUUID(),
            expectedParticipantId: session.actorId,
            deviceId: local.deviceId,
            activeAfter: created?.payload.id,
            literalAfter: created
              ? created.payload.kind === "box" || created.payload.kind === "bag"
              : undefined,
          });
        }
      });
      void sync();
      return;
    }
    if (choice.text) return send(choice.text);
    if (choice.action && session)
      return submit({
        operationId: crypto.randomUUID(),
        expectedParticipantId: session.actorId,
        expectedVersions: choice.versions ?? {},
        action: choice.action,
      });
    if (choice.activeUnitId)
      await write((d) => {
        d.activeUnitId = choice.activeUnitId!;
      });
  };
  const logout = async () => {
    stopped.current = true;
    await meta("activeSession", null);
    await meta("pendingSignout", !session?.demo);
    if (session && !session.demo && navigator.onLine) {
      try {
        await api("auth/signout", {});
        await meta("pendingSignout", false);
      } catch {
        /* local remains locked; login resolves server signout first */
      }
    }
    setSession(null);
    setDoc(null);
  };
  return {
    session,
    doc,
    state: doc ? project(doc) : null,
    loading,
    busy: busy || mutating,
    online,
    error,
    setError,
    startDemo,
    write,
    submit,
    send,
    choose,
    sync,
    logout,
  };
}
