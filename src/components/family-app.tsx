"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Box,
  Check,
  ChevronRight,
  Clock3,
  Download,
  House,
  LockKeyhole,
  MessageCircle,
  Mic,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Sofa,
  Star,
  Truck,
  Undo2,
  WifiOff,
  X,
  Wine,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { command, Command, versionsFor } from "../domain/commands";
import { Choice } from "../domain/chat";
import {
  contents,
  Entry,
  Kind,
  kindNames,
  location,
  roomName,
  rooms,
  Unit,
} from "../domain/model";
import { search } from "../domain/search";
import { offlineExport, Message, meta } from "../offline/store";
import { api, useFamily } from "./use-family";
import { exportInventory, unitsCsv } from "../server/backup";
import { demoCandidates, HistoricalCandidate } from "../domain/import-model";

type View =
  | "chat"
  | "menu"
  | "inventory"
  | "detail"
  | "move"
  | "settings"
  | "sync"
  | "review"
  | "install";
type Editor = {
  type:
    | "create"
    | "unit"
    | "content"
    | "transfer"
    | "split"
    | "split_content"
    | "correction"
    | "link"
    | "import";
  unit?: Unit;
  entry?: Entry;
  candidate?: HistoricalCandidate;
};
const time = (at: string) =>
  new Date(at).toLocaleString("es-AR", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const actionLabels: Record<string, string> = {
  create_unit: "Crear unidad",
  append_content: "Agregar contenido",
  edit_content: "Corregir contenido",
  close_unit: "Cerrar contenedor",
  reopen_unit: "Reabrir contenedor",
  update_unit: "Editar unidad",
  update_own_profile: "Editar apodo",
  set_transit_state: "Registrar traslado",
  set_unpack_state: "Registrar desempaque",
  transfer_content: "Mover contenido",
  unpack_content: "Retirar contenido",
  archive_unit: "Archivar unidad",
  restore_unit: "Restaurar unidad",
  undo_event: "Deshacer cambio",
  compound: "Guardar cambios juntos",
  split_unit_group: "Dividir lote",
  link_accessory: "Relacionar accesorio",
  unlink_accessory: "Quitar relación",
};
function pendingDescription(
  c: Command,
  state: import("../domain/model").State,
) {
  const actions =
    c.action.type === "compound" ? c.action.payload.actions : [c.action];
  return actions
    .map((a) => {
      const p = a.payload as Record<string, unknown>;
      const u = state.units.find((u) => u.id === p.unitId);
      const e = state.entries.find((e) => e.id === p.entryId);
      return [
        actionLabels[a.type] ?? "Corregir inventario",
        u?.code,
        p.description ?? p.name ?? e?.description ?? "",
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");
}
function download(value: unknown, name: string, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type },
    ),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function UnitIcon({ kind }: { kind: Kind }) {
  return (
    <span
      className={`unit-icon ${kind === "furniture" || kind === "other" ? "lilac" : ""}`}
    >
      {kind === "box" ? (
        <Box />
      ) : kind === "bag" ? (
        <ShoppingBag />
      ) : kind === "furniture" ? (
        <Sofa />
      ) : (
        <PackageOpen />
      )}
    </span>
  );
}
function Status({ unit, pending = false }: { unit: Unit; pending?: boolean }) {
  const label = unit.archived
    ? "Archivada"
    : unit.unpacking === "done"
      ? "Desempacada"
      : unit.transit === "at_destination"
        ? "Llegó"
        : unit.transit === "in_transit"
          ? "Cargada"
          : unit.packing === "open"
            ? "Abierta"
            : unit.packing === "closed"
              ? "Cerrada"
              : "Pendiente";
  return (
    <span
      className={`badge ${pending ? "orange" : unit.transit === "in_transit" ? "blue" : "green"}`}
    >
      {pending ? "Pendiente · " : ""}
      {label}
    </span>
  );
}
function RoomSelect({
  name = "room",
  value = "",
  label = "Destino en la casa nueva",
}: {
  name?: string;
  value?: string | null;
  label?: string;
}) {
  return (
    <label className="field">
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">Sin asignar</option>
        {rooms.map((r) => (
          <option value={r.key} key={r.key}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Cerrar ventana"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function FamilyApp({
  configured,
  demoAllowed,
  environment,
}: {
  configured: boolean;
  demoAllowed: boolean;
  environment: string;
}) {
  const family = useFamily(environment, demoAllowed, configured);
  const { state, doc, session } = family;
  const [view, setView] = useState<View>("chat");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [room, setRoom] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    run: () => Promise<void>;
  } | null>(null);
  const [motion, setMotion] = useState(false);
  const [historicalQuery, setHistoricalQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [formError, setFormError] = useState("");
  const [usage, setUsage] = useState<{
    spent: string;
    reserved: string;
    budget: string;
    enabled: boolean;
  } | null>(null);
  const [aiCheck, setAiCheck] = useState("");
  const [checkingAi, setCheckingAi] = useState(false);
  const [notice, setNotice] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const draftOwner = useRef<string | undefined>(undefined);
  const [importSession, setImportSession] = useState("");
  const [importStatus, setImportStatus] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [historicalCandidates, setHistoricalCandidates] = useState<
    HistoricalCandidate[]
  >([]);
  useEffect(() => {
    if (draftOwner.current === doc?.owner) return;
    draftOwner.current = doc?.owner;
    setDraft(doc?.draft ?? "");
  }, [doc?.owner, doc?.draft]);
  const reportError = family.setError;
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("auth");
    if (result === "denied")
      reportError(
        "Esta cuenta no tiene acceso a la mudanza. Podés cambiar de cuenta Google.",
      );
    if (result === "failed")
      reportError(
        "No pudimos completar el ingreso con Google. Podés volver a intentarlo.",
      );
  }, [reportError]);
  useEffect(() => {
    if (view !== "review" || !session) return;
    if (session.demo) {
      setHistoricalCandidates(demoCandidates);
      return;
    }
    api<{
      candidates: HistoricalCandidate[];
      sessionId: string;
      rows: { row_number: number; status: string }[];
    }>("imports/preview", {})
      .then((result) => {
        setHistoricalCandidates(result.candidates);
        setImportSession(result.sessionId);
        setImportStatus(
          Object.fromEntries(result.rows.map((r) => [r.row_number, r.status])),
        );
      })
      .catch((e) =>
        reportError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar las referencias.",
        ),
      );
  }, [view, session, reportError]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          const update = () =>
            setNotice(
              "Actualización disponible. Tus borradores y pendientes se conservan; cerrá y volvé a abrir la app cuando termines.",
            );
          if (registration.waiting) update();
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                update();
            });
          });
        })
        .catch(() => setNotice("No se pudo preparar el acceso sin conexión."));
    setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "instant",
    });
  }, [doc?.messages.length, view, family.loading]);
  useEffect(() => {
    if (view === "settings" && session && !session.demo && family.online)
      api<typeof usage>("usage")
        .then(setUsage)
        .catch(() => setUsage(null));
  }, [view, session, family.online]);
  const pendingCount =
    (doc?.queue.length ?? 0) + (doc?.resolutions?.length ?? 0);
  const actor = state?.participants.find((p) => p.id === session?.actorId);
  const active = state?.units.find(
    (u) => u.id === doc?.activeUnitId && !u.archived,
  );
  const selected = state?.units.find((u) => u.id === selectedId);
  const pending = (unit: Unit) =>
    doc?.queue.some((p) => p.entityIds.includes(unit.id)) ?? false;
  const code = (unit: Unit) =>
    !session?.demo &&
    pending(unit) &&
    !doc?.confirmed.units.some((u) => u.id === unit.id) &&
    !doc?.queue.some((p) => {
      const a = p.command.action;
      return (
        a.type === "create_unit" && a.payload.id === unit.id && a.payload.code
      );
    })
      ? "Borrador · sin etiqueta"
      : unit.code;
  const navigate = (v: View) => {
    setView(v);
    setFormError("");
  };
  const detail = (id: string) => {
    setSelectedId(id);
    navigate("detail");
  };
  const act = async (action: Command["action"], ids: string[] = []) => {
    if (!state || !session) return;
    await family.submit(
      command(session.actorId, action, versionsFor(state, ids)),
    );
  };
  const safe = (action: () => Promise<unknown>) => {
    void action().catch((e) =>
      family.setError(e instanceof Error ? e.message : "No se pudo completar."),
    );
  };
  const sendText = (text: string, clearDraft = false) => {
    navigate("chat");
    safe(async () => {
      await family.send(text);
      if (clearDraft) setDraft("");
    });
  };
  const openEditor = (e: Editor) => {
    setFormError("");
    setEditor(e);
  };
  const workWith = (unit: Unit) => {
    safe(async () => {
      await family.write((d) => {
        d.activeUnitId = unit.id;
        d.literal = unit.packing === "open";
        d.clarification = undefined;
      });
      navigate("chat");
    });
  };
  const ask = (title: string, text: string, run: () => Promise<void>) =>
    setConfirm({ title, text, run });
  const unitCard = (unit: Unit, evidence?: string, historical = false) => (
    <button
      className={`unit-card ${historical ? "historical" : ""}`}
      key={`${unit.id}:${evidence ?? ""}`}
      onClick={() => detail(unit.id)}
    >
      <div className="row">
        <UnitIcon kind={unit.kind} />
        <div className="grow">
          <div className="row between">
            <strong>{code(unit)}</strong>
            <Status unit={unit} pending={pending(unit)} />
          </div>
          <div className="unit-name">{evidence ?? unit.name}</div>
          <span className="small">
            {historical ? "Contenido histórico" : roomName(unit.destination)}
          </span>
        </div>
        <ChevronRight size={18} />
      </div>
      {(unit.fragile || unit.priority) && (
        <div className="badges">
          {unit.fragile && (
            <span className="badge orange">
              <Wine size={12} />
              Frágil
            </span>
          )}
          {unit.priority && (
            <span className="badge green">
              <Star size={12} />
              Abrir primero
            </span>
          )}
        </div>
      )}
    </button>
  );
  const manualMenu = (
    <>
      <p className="kicker">Seguir en el chat</p>
      <button className="button mint" onClick={() => sendText("Nueva caja")}>
        <Plus size={19} />
        Nueva caja
      </button>
      <button className="button mint" onClick={() => sendText("Nueva bolsa")}>
        <ShoppingBag size={19} />
        Nueva bolsa
      </button>
      {active && (
        <>
          <button
            className="button mint"
            onClick={() => {
              safe(() =>
                family.write((d) => {
                  d.literal = true;
                  d.clarification = undefined;
                }),
              );
              navigate("chat");
              input.current?.focus();
            }}
          >
            <Box size={19} />
            Agregar contenido a {code(active)}
          </button>
          {active.packing === "open" && (
            <button className="button mint" onClick={() => sendText("Cerrala")}>
              <LockKeyhole size={19} />
              Cerrar {code(active)}
            </button>
          )}
        </>
      )}
      <button
        className="button mint"
        onClick={() => {
          navigate("chat");
          setDraft("¿Dónde está ");
          safe(() =>
            family.write((d) => {
              d.literal = false;
              d.draft = "¿Dónde está ";
            }),
          );
          input.current?.focus();
        }}
      >
        <Search size={19} />
        Buscar algo
      </button>
      <h3>Consultar y organizar</h3>
      {(
        [
          [Box, "Nuestras cosas", "inventory"],
          [Truck, "Resumen de mudanza", "move"],
          [Settings, "Cuenta y ajustes", "settings"],
          [Clock3, "Sincronización", "sync"],
        ] as const
      ).map(([Icon, title, target]) => (
        <button
          key={target}
          className="link-row"
          onClick={() => navigate(target)}
        >
          <Icon size={20} />
          {title}
          <ChevronRight size={18} />
        </button>
      ))}
    </>
  );
  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !state || !session) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const destination = value("room") || null;
    try {
      if (editor.type === "import" && editor.candidate && !session.demo) {
        if (!importSession)
          throw new Error("Esperá a que termine de cargar la importación.");
        const kind = value("kind") as Kind;
        const count = Number(value("count") || 1);
        if (data.has("exists") && ["box", "bag"].includes(kind) && count !== 1)
          throw new Error(
            "Revisá cada caja o bolsa por separado; no se crean contenedores en lote.",
          );
        const reviewed = {
          row: editor.candidate.row,
          exists: data.has("exists"),
          kind,
          name: value("name"),
          count,
          destination,
        };
        await family.write((local) => {
          local.importReview ??= { sessionId: importSession, rows: [] };
          if (local.importReview.sessionId !== importSession)
            throw new Error("Cambió la sesión de importación.");
          local.importReview.rows = local.importReview.rows.filter(
            (r) => r.row !== reviewed.row,
          );
          local.importReview.rows.push(reviewed);
        });
      } else if (editor.type === "create" || editor.type === "import") {
        const kind = value("kind") as Kind;
        const id = crypto.randomUUID();
        await act({
          type: "create_unit",
          payload: {
            id,
            kind,
            name: value("name"),
            destination,
            count: ["box", "bag"].includes(kind)
              ? 1
              : Number(value("count") || "1"),
            fragile: data.has("fragile"),
            priority: data.has("priority"),
            ...(editor.candidate
              ? {
                  provenance: {
                    source: editor.candidate.source,
                    row: editor.candidate.row,
                    comment: editor.candidate.comment,
                  },
                }
              : {}),
          },
        });
        await family.write((d) => {
          d.activeUnitId = id;
          d.literal = ["box", "bag"].includes(kind);
          d.clarification = undefined;
        });
        navigate("chat");
      } else if (editor.type === "unit" && editor.unit) {
        await act(
          {
            type: "update_unit",
            payload: {
              unitId: editor.unit.id,
              patch: {
                name: value("name"),
                destination,
                notes: value("notes"),
                source: value("source"),
                size: value("size"),
                fragile: data.has("fragile"),
                priority: data.has("priority"),
              },
            },
          },
          [editor.unit.id],
        );
      } else if (editor.type === "content" && editor.unit) {
        const quantity = value("quantity") ? Number(value("quantity")) : null;
        await act(
          editor.entry
            ? {
                type: "edit_content",
                payload: {
                  entryId: editor.entry.id,
                  description: value("description"),
                  quantity,
                },
              }
            : {
                type: "append_content",
                payload: {
                  unitId: editor.unit.id,
                  id: crypto.randomUUID(),
                  description: value("description"),
                  quantity,
                },
              },
          editor.entry ? [editor.entry.id] : [],
        );
      } else if (editor.type === "transfer" && editor.entry && editor.unit) {
        const target = value("target");
        await act(
          target
            ? {
                type: "transfer_content",
                payload: { entryId: editor.entry.id, targetUnitId: target },
              }
            : {
                type: "unpack_content",
                payload: { entryId: editor.entry.id, room: destination },
              },
          [editor.entry.id, editor.unit.id, ...(target ? [target] : [])],
        );
      } else if (editor.type === "split" && editor.unit) {
        await act(
          {
            type: "split_unit_group",
            payload: {
              unitId: editor.unit.id,
              id: crypto.randomUUID(),
              count: Number(value("count")),
              destination,
            },
          },
          [editor.unit.id],
        );
      } else if (
        editor.type === "split_content" &&
        editor.entry &&
        editor.unit
      ) {
        await act(
          {
            type: "split_content",
            payload: {
              entryId: editor.entry.id,
              id: crypto.randomUUID(),
              quantity: Number(value("quantity")),
              description: value("description"),
            },
          },
          [editor.entry.id, editor.unit.id],
        );
      } else if (editor.type === "correction" && editor.unit) {
        if (!data.has("confirm"))
          throw new Error("Confirmá la corrección del estado anterior.");
        const actions: Exclude<Command["action"], { type: "compound" }>[] = [];
        if (
          value("transit") !== editor.unit.transit ||
          destination !== editor.unit.actualRoom
        )
          actions.push({
            type: "set_transit_state",
            payload: {
              unitId: editor.unit.id,
              state: value("transit") as Unit["transit"],
              actualRoom: destination,
              correction: true,
            },
          });
        if (value("unpacking") && value("unpacking") !== editor.unit.unpacking)
          actions.push({
            type: "set_unpack_state",
            payload: {
              unitId: editor.unit.id,
              state: value("unpacking") as "not_started" | "partial" | "done",
              correction: true,
            },
          });
        if (!actions.length) throw new Error("No hay cambios de estado.");
        await act(
          actions.length === 1
            ? actions[0]
            : { type: "compound", payload: { actions } },
          [editor.unit.id],
        );
      } else if (editor.type === "link" && editor.entry) {
        await act(
          {
            type: "link_accessory",
            payload: {
              id: crypto.randomUUID(),
              entryId: editor.entry.id,
              unitId: value("target"),
              relation: "accessory",
            },
          },
          [editor.entry.id, value("target")],
        );
      }
      setEditor(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Revisá los datos.");
    }
  }
  async function commitReviewedImport() {
    const review = doc?.importReview;
    if (!review || !session || !doc || importing) return;
    setImporting(true);
    try {
      for (let start = 0; start < review.rows.length; start += 20) {
        const rows = review.rows.slice(start, start + 20);
        const result = await api<{ rows: { row: number; status: string }[] }>(
          "imports/commit",
          {
            sessionId: review.sessionId,
            rows,
            deviceId: doc.deviceId,
            expectedParticipantId: session.actorId,
          },
        );
        setImportStatus((previous) => ({
          ...previous,
          ...Object.fromEntries(result.rows.map((r) => [r.row, r.status])),
        }));
        await family.write((local) => {
          if (local.importReview)
            local.importReview.rows = local.importReview.rows.filter(
              (r) => !rows.some((done) => done.row === r.row),
            );
        });
      }
      setNotice(
        "Revisión guardada. Las unidades incluidas ya están en la mudanza.",
      );
      await family.sync();
    } catch (e) {
      family.setError(
        e instanceof Error
          ? e.message
          : "No se pudo confirmar. Podés reintentar las filas pendientes.",
      );
    } finally {
      setImporting(false);
    }
  }
  const confirmChoice = (choice: Choice, message: Message) => {
    safe(() => family.choose(choice, message.expiresAt));
  };
  if (family.loading)
    return (
      <main className="app-shell">
        <div className="loading">
          <span className="brand-icon">
            <House />
          </span>
          <p>Abriendo nuestra casa…</p>
        </div>
      </main>
    );
  if (!session || !state || !doc)
    return (
      <main className="app-shell login">
        <header className="app-header">
          <div className="brand">
            <span className="brand-icon">
              <House />
            </span>
            <span>
              Casa de los
              <br />
              <strong>Gesualdo</strong>
            </span>
          </div>
        </header>
        <div className="page-content">
          <div className={`home-art ${motion ? "moving" : ""}`}>
            <img src="/casa.png" alt="" />
            <span aria-hidden="true">✦</span>
          </div>
          <p className="eyebrow">Familia Gesualdo</p>
          <h1>Nuestra casa nueva</h1>
          <p className="muted lead">
            Acá anotamos las cajas, los muebles y dónde queda cada cosa.
          </p>
          {family.error && (
            <p className="error" role="alert">
              {family.error}
            </p>
          )}
          {configured && (
            <form
              action="/api/auth/google"
              method="POST"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                safe(async () => {
                  if (await meta<boolean>("pendingSignout")) {
                    await api("auth/signout", {});
                    await meta("pendingSignout", false);
                  }
                  form.submit();
                });
              }}
            >
              <button className="button secondary" type="submit">
                <span className="google-g">G</span>Continuar con Google
              </button>
            </form>
          )}
          {!configured && (
            <p className="small muted">
              El acceso familiar todavía necesita configuración.
            </p>
          )}
          {demoAllowed && (
            <>
              <button className="button" onClick={() => safe(family.startDemo)}>
                Probar demo local
              </button>
              <p className="small muted center">
                Datos de ejemplo · solo en este dispositivo
              </p>
            </>
          )}
          <div className="card lilac">
            <h3>
              <House size={20} />
              Agregar al inicio del iPhone
            </h3>
            <p>
              Abrí la app en Safari, tocá Compartir y elegí “Agregar a pantalla
              de inicio”.
            </p>
          </div>
          <p className="small muted">
            Solo usamos tu nombre y correo para identificarte.
          </p>
        </div>
      </main>
    );
  const units = state.units.filter((u) => !u.archived);
  const inventory = (
    query
      ? [
          ...new Map(
            search(state, query).map((h) => [h.unit.id, h.unit]),
          ).values(),
        ]
      : state.units
  ).filter(
    (u) =>
      (filter === "archived" ? u.archived : !u.archived) &&
      (kind === "all" || u.kind === kind) &&
      (!room || u.destination === room) &&
      (filter === "all" ||
        filter === "archived" ||
        (filter === "open" && u.packing === "open") ||
        (filter === "missing-room" && !u.destination) ||
        (filter === "origin" && u.transit === "at_origin") ||
        (filter === "transit" && u.transit === "in_transit") ||
        (filter === "arrived" && u.transit === "at_destination") ||
        (filter === "unpack" &&
          ["not_started", "partial"].includes(u.unpacking)) ||
        (filter === "priority" && u.priority) ||
        (filter === "fragile" && u.fragile)),
  );
  const title: Record<View, string> = {
    chat: "",
    menu: "Menú",
    inventory: "Nuestras cosas",
    detail: "Ficha",
    move: "Nuestra mudanza",
    settings: "Cuenta y ajustes",
    sync: "Sincronización",
    review: "Revisión histórica",
    install: "Agregar al inicio",
  };
  return (
    <main className={`app-shell ${motion ? "motion" : ""}`}>
      {session.demo && (
        <div className="demo-banner">
          Demo local · los cambios quedan en este dispositivo
        </div>
      )}
      <header className="app-header">
        {view === "chat" ? (
          <div className="brand">
            <span className="brand-icon">
              <House />
            </span>
            <span>
              Casa de los
              <br />
              <strong>Gesualdo</strong>
            </span>
          </div>
        ) : (
          <div className="row">
            <button
              className="icon-button back"
              onClick={() => navigate("chat")}
              aria-label="Volver al chat"
            >
              <ArrowLeft />
            </button>
            <strong>{title[view]}</strong>
          </div>
        )}
        <div className="row">
          <button
            className="avatar"
            onClick={() => navigate("settings")}
            aria-label={`Cuenta de ${actor?.nickname}`}
          >
            {actor?.nickname[0]}
          </button>
          <button
            className="icon-button borderless"
            onClick={() => navigate("menu")}
            aria-label="Abrir menú"
          >
            <MoreHorizontal />
          </button>
        </div>
      </header>
      <div className="syncbar" role="status">
        {!family.online ? (
          <WifiOff size={13} />
        ) : family.busy ? (
          <Clock3 size={13} />
        ) : (
          <Check size={13} />
        )}
        <span>
          {actor?.nickname} ·{" "}
          {session.demo
            ? "copia local de ejemplo"
            : family.busy
              ? "sincronizando"
              : pendingCount
                ? `${pendingCount} cambios pendientes`
                : family.online
                  ? "todo al día"
                  : "sin conexión · copia local"}
        </span>
        {pendingCount > 0 && (
          <button onClick={() => navigate("sync")}>
            {pendingCount} pendientes
          </button>
        )}
      </div>
      {family.error && (
        <div className="error error-bar" role="alert">
          <AlertTriangle size={18} />
          <span>{family.error}</span>
          <button
            className="icon-button"
            onClick={() => family.setError("")}
            aria-label="Ocultar aviso"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {view === "chat" && active && (
        <div className="chat-context">
          <Box size={17} />
          <strong className="grow">
            {code(active)} · {roomName(active.destination)}
          </strong>
          <Status unit={active} pending={pending(active)} />
          <button
            className="icon-button borderless"
            onClick={() => detail(active.id)}
            aria-label="Ver ficha de unidad activa"
          >
            <ChevronRight size={19} />
          </button>
        </div>
      )}
      {view === "chat" ? (
        <>
          <div className="conversation" ref={scroll} aria-label="Conversación">
            {doc.messages.length === 0 ? (
              <div className="chat-welcome">
                <span className="welcome-icon">
                  <House size={29} />
                </span>
                <h1>Hola, {actor?.nickname}</h1>
                <p className="muted">¿Qué hacemos con la mudanza?</p>
                <div className="chat-examples">
                  <p className="kicker">Podés escribir o dictar</p>
                  {[
                    "Estoy armando una caja para la cocina",
                    "¿Dónde está la pava eléctrica?",
                    "¿Qué falta llevar a casa?",
                  ].map((text) => (
                    <button key={text} onClick={() => sendText(text)}>
                      {text}
                    </button>
                  ))}
                </div>
                <p className="small muted">
                  Si necesitás ver todas las cajas, están en el menú de arriba.
                </p>
              </div>
            ) : (
              <>
                <p className="date-label">Nuestra conversación</p>
                {doc.messages.map((message) => (
                  <div key={message.id} className={`bubble ${message.role}`}>
                    <p>{message.text}</p>
                    {message.hits?.map((hit, index) => {
                      const current = state.units.find(
                        (u) => u.id === hit.unit.id,
                      );
                      const entry =
                        hit.entryId &&
                        state.entries.find((e) => e.id === hit.entryId);
                      if (
                        !current ||
                        current.archived ||
                        (entry && entry.state === "archived")
                      )
                        return (
                          <p className="small muted" key={index}>
                            Esta referencia cambió. Repetí la búsqueda.
                          </p>
                        );
                      return (
                        <div className="chat-unit" key={index}>
                          <div className="row between">
                            <strong>
                              {code(current)} · {roomName(current.destination)}
                            </strong>
                            <Status unit={current} pending={pending(current)} />
                          </div>
                          <p>“{entry ? entry.description : hit.evidence}”</p>
                          {hit.approximate && (
                            <p className="small muted">
                              Posible coincidencia por escritura similar.
                            </p>
                          )}
                          <p className="small">
                            <strong>Ahora: </strong>
                            {entry && entry.state === "unpacked"
                              ? entry.room
                                ? `Retirado · ${roomName(entry.room)}`
                                : `Estaba en ${current.code}; ya se retiró y no se registró dónde quedó`
                              : location(current)}
                            <br />
                            <strong>Va a: </strong>
                            {roomName(current.destination)}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => detail(current.id)}
                          >
                            Ver detalle
                          </button>
                        </div>
                      );
                    })}
                    {message.choices && (
                      <div className="choices">
                        {message.choices.map((choice, index) => (
                          <button
                            key={index}
                            onClick={() => confirmChoice(choice, message)}
                            disabled={family.busy}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {message.status && (
                      <p
                        className={`receipt ${message.operationId && doc.queue.some((p) => p.command.operationId === message.operationId) ? "pending" : ""}`}
                      >
                        {message.status.startsWith("Guardado") ? (
                          <Check size={13} />
                        ) : (
                          <Clock3 size={13} />
                        )}
                        {message.status} ·{" "}
                        {time(message.receipt?.at ?? message.at)}
                      </p>
                    )}
                    {message.receipt && (
                      <button
                        className="text-button"
                        onClick={() =>
                          safe(() =>
                            act(
                              {
                                type: "undo_event",
                                payload: { eventId: message.receipt!.eventId },
                              },
                              message.receipt!.changes.map((c) => c.id),
                            ),
                          )
                        }
                      >
                        <Undo2 size={14} />
                        Deshacer
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="composer">
            {doc.literal && active && (
              <div className="literal-mode">
                <Plus size={13} />
                Agregar contenido a {code(active)}
                <button
                  className="icon-button"
                  onClick={() =>
                    safe(() =>
                      family.write((d) => {
                        d.literal = false;
                      }),
                    )
                  }
                  aria-label="Salir del modo agregar contenido"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {active && (
              <div className="shortcuts">
                {active.packing === "open" && (
                  <button onClick={() => sendText("Cerrala")}>
                    Cerrar {code(active)}
                  </button>
                )}
                {active.packing === "closed" &&
                  active.transit === "at_origin" && (
                    <button onClick={() => sendText(`Cargar ${active.code}`)}>
                      Marcar cargada
                    </button>
                  )}
                {active.transit === "in_transit" && (
                  <button
                    onClick={() => sendText(`${active.code} llegó a casa`)}
                  >
                    Llegó a casa
                  </button>
                )}
                {active.transit === "at_destination" &&
                  active.unpacking !== "done" &&
                  ["box", "bag"].includes(active.kind) && (
                    <button onClick={() => sendText("Terminar desempaque")}>
                      Terminar desempaque
                    </button>
                  )}
                <button onClick={() => sendText("Nueva caja")}>
                  Nueva caja
                </button>
              </div>
            )}
            <form
              className="input-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) sendText(draft.trim(), true);
              }}
            >
              <button
                type="button"
                className="chat-tools"
                onClick={() => navigate("menu")}
                aria-label="Acciones y accesos"
              >
                <Plus />
              </button>
              <textarea
                ref={input}
                aria-label="Mensaje para la mudanza"
                placeholder="Escribí o dictá…"
                autoCapitalize="sentences"
                spellCheck
                rows={draft.length > 36 ? 2 : 1}
                maxLength={4000}
                value={draft}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft(value);
                  safe(() =>
                    family.write((d) => {
                      d.draft = value;
                    }),
                  );
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (draft.trim()) sendText(draft.trim(), true);
                  }
                }}
              />
              <button
                className="send"
                type="submit"
                disabled={!draft.trim() || family.busy}
                aria-label="Enviar mensaje"
              >
                <ArrowUp />
              </button>
            </form>
            <p className="dictation-hint">
              <Mic size={12} />
              Para hablar, usá el micrófono del teclado.
            </p>
          </div>
        </>
      ) : (
        <div className="page-content scroll-content">
          {view === "menu" && (
            <>
              <h1>¿Qué necesitás?</h1>
              {manualMenu}
            </>
          )}
          {view === "inventory" && (
            <>
              <div className="row between">
                <h1>Nuestras cosas</h1>
                <button
                  className="icon-button"
                  onClick={() => openEditor({ type: "create" })}
                  aria-label="Crear unidad"
                >
                  <Plus />
                </button>
              </div>
              <label className="search">
                <Search size={20} />
                <input
                  aria-label="Buscar en inventario"
                  placeholder="Código, contenido o nombre"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="chips">
                {[
                  ["all", "Todo"],
                  ["box", "Cajas"],
                  ["bag", "Bolsas"],
                  ["furniture", "Muebles"],
                  ["other", "Otros"],
                ].map(([key, name]) => (
                  <button
                    aria-pressed={kind === key}
                    className={kind === key ? "active" : ""}
                    key={key}
                    onClick={() => setKind(key)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="filter-grid">
                <label className="field">
                  Ambiente
                  <select
                    aria-label="Filtrar por ambiente"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {rooms.map((r) => (
                      <option value={r.key} key={r.key}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Estado
                  <select
                    aria-label="Filtrar por estado"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {[
                      ["all", "Todos"],
                      ["open", "Abiertas"],
                      ["missing-room", "Sin destino"],
                      ["origin", "Falta cargar"],
                      ["transit", "En camino"],
                      ["arrived", "Llegaron"],
                      ["unpack", "Falta desempacar"],
                      ["priority", "Abrir primero"],
                      ["fragile", "Frágiles"],
                      ["archived", "Archivadas"],
                    ].map(([key, text]) => (
                      <option key={key} value={key}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="small muted">
                {inventory.length} unidades ·{" "}
                {session.demo
                  ? "demo local"
                  : pendingCount || !family.online
                    ? "copia local con pendientes"
                    : "inventario confirmado"}
              </p>
              {inventory.length ? (
                inventory.map((u) => unitCard(u))
              ) : (
                <div className="empty-state">
                  <div className="home-art">
                    <img src="/casa.png" alt="" />
                  </div>
                  <h2>
                    {units.length
                      ? "No hay coincidencias"
                      : "Todavía no hay cajas"}
                  </h2>
                  <p className="muted">
                    Podemos empezar por una caja o una bolsa.
                  </p>
                  <button
                    className="button"
                    onClick={() => openEditor({ type: "create" })}
                  >
                    <Plus size={18} />
                    Crear una unidad
                  </button>
                </div>
              )}
            </>
          )}
          {view === "detail" && selected && (
            <>
              <div className="row between">
                <h1 className="hero-code">{code(selected)}</h1>
                <Status unit={selected} pending={pending(selected)} />
              </div>
              <p className="muted">
                {selected.name} · {kindNames[selected.kind]}
                {selected.count > 1 && ` · ${selected.count} objetos`}
              </p>
              <div className="badges">
                {selected.fragile && (
                  <span className="badge orange">
                    <Wine size={12} />
                    Frágil
                  </span>
                )}
                {selected.priority && (
                  <span className="badge green">
                    <Star size={12} />
                    Abrir primero
                  </span>
                )}
              </div>
              <div className="location-grid">
                <div>
                  <p className="kicker">Destino previsto</p>
                  <strong>{roomName(selected.destination)}</strong>
                  <p className="small">Casa nueva</p>
                </div>
                <div>
                  <p className="kicker">Ubicación actual</p>
                  <strong>{location(selected)}</strong>
                  <p className="small">
                    {pending(selected)
                      ? "Cambio local pendiente"
                      : session.demo
                        ? "Registro local de ejemplo"
                        : "Registro confirmado"}
                  </p>
                </div>
              </div>
              {selected.closedAt && (
                <div className="card mint">
                  <p>
                    <LockKeyhole size={16} /> Cerrada por{" "}
                    {
                      state.participants.find((p) => p.id === selected.closedBy)
                        ?.nickname
                    }{" "}
                    · {time(selected.closedAt)}
                  </p>
                </div>
              )}
              {["box", "bag"].includes(selected.kind) && (
                <>
                  <div className="section-head">
                    <h3>
                      Contenido · {contents(state, selected.id).length} entradas
                    </h3>
                    <button
                      className="text-button"
                      onClick={() =>
                        openEditor({ type: "content", unit: selected })
                      }
                    >
                      <Plus size={15} />
                      Agregar
                    </button>
                  </div>
                  <div className="card content-card">
                    {state.entries
                      .filter(
                        (e) =>
                          e.unitId === selected.id ||
                          e.lastUnitId === selected.id,
                      )
                      .map((e) => (
                        <div className="content-row" key={e.id}>
                          <div className="grow">
                            <p>
                              {e.description}
                              {e.quantity !== null && (
                                <span className="small muted">
                                  {" "}
                                  · cantidad: {e.quantity}
                                </span>
                              )}
                            </p>
                            {e.state !== "packed" && (
                              <p className="small muted">
                                {e.state === "archived"
                                  ? "Archivada"
                                  : `Retirado · ${e.room ? roomName(e.room) : "ubicación sin registrar"}`}
                              </p>
                            )}
                            {state.links
                              .filter(
                                (l) =>
                                  l.entryId === e.id &&
                                  l.relation !== "removed",
                              )
                              .map((l) => (
                                <p className="small muted" key={l.id}>
                                  Accesorio de{" "}
                                  {
                                    state.units.find((u) => u.id === l.unitId)
                                      ?.code
                                  }{" "}
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      safe(() =>
                                        act(
                                          {
                                            type: "unlink_accessory",
                                            payload: { linkId: l.id },
                                          },
                                          [l.id],
                                        ),
                                      )
                                    }
                                  >
                                    Quitar relación
                                  </button>
                                </p>
                              ))}
                          </div>
                          <button
                            className="icon-button borderless"
                            onClick={() =>
                              openEditor({
                                type: "content",
                                unit: selected,
                                entry: e,
                              })
                            }
                            aria-label={`Editar ${e.description}`}
                          >
                            <Pencil size={17} />
                          </button>
                          {e.state === "packed" && (
                            <div className="entry-actions">
                              <button
                                className="text-button"
                                onClick={() =>
                                  openEditor({
                                    type: "transfer",
                                    unit: selected,
                                    entry: e,
                                  })
                                }
                              >
                                Retirar / mover
                              </button>
                              {e.quantity !== null && e.quantity > 0.01 && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    openEditor({
                                      type: "split_content",
                                      unit: selected,
                                      entry: e,
                                    })
                                  }
                                >
                                  Separar parte del contenido
                                </button>
                              )}
                              <button
                                className="text-button"
                                onClick={() =>
                                  openEditor({
                                    type: "link",
                                    unit: selected,
                                    entry: e,
                                  })
                                }
                              >
                                Relacionar accesorio
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    {!state.entries.some(
                      (e) =>
                        e.unitId === selected.id ||
                        e.lastUnitId === selected.id,
                    ) && (
                      <p className="muted">Todavía sin contenido registrado.</p>
                    )}
                  </div>
                </>
              )}
              {!["box", "bag"].includes(selected.kind) &&
                state.links
                  .filter(
                    (l) => l.unitId === selected.id && l.relation !== "removed",
                  )
                  .map((l) => {
                    const entry = state.entries.find((e) => e.id === l.entryId);
                    const container = state.units.find(
                      (u) => u.id === entry?.unitId,
                    );
                    return (
                      <div className="card lilac" key={l.id}>
                        <strong>{entry?.description}</strong>
                        <p>
                          {container
                            ? `Dentro de ${container.code}`
                            : "Retirado · ubicación sin confirmar"}
                        </p>
                        {container && (
                          <button
                            className="text-button"
                            onClick={() => detail(container.id)}
                          >
                            Ver contenedor
                          </button>
                        )}
                      </div>
                    );
                  })}
              {selected.notes && (
                <div className="card">
                  <h3>Notas</h3>
                  <p>{selected.notes}</p>
                </div>
              )}
              <div className="action-grid">
                <button
                  className="button secondary"
                  onClick={() =>
                    openEditor({ type: "correction", unit: selected })
                  }
                >
                  Corregir estado o ubicación
                </button>
                <button
                  className="button secondary"
                  onClick={() => workWith(selected)}
                >
                  Trabajar con esta unidad
                </button>
                <button
                  className="button secondary"
                  onClick={() => openEditor({ type: "unit", unit: selected })}
                >
                  <Pencil size={17} />
                  Editar datos
                </button>
                {selected.packing === "open" && (
                  <button
                    className="button"
                    onClick={() => sendText(`Cerrar ${selected.code}`)}
                  >
                    <Check size={18} />
                    Cerrar {kindNames[selected.kind].toLowerCase()}
                  </button>
                )}
                {selected.packing === "closed" && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      ask(
                        "Reabrir",
                        `Reabrir ${selected.code}${selected.unpacking === "done" ? " para reutilizarla" : ""}. El historial se conserva.`,
                        () =>
                          act(
                            {
                              type: "reopen_unit",
                              payload: {
                                unitId: selected.id,
                                reuse: selected.unpacking === "done",
                              },
                            },
                            [selected.id],
                          ),
                      )
                    }
                  >
                    Reabrir
                  </button>
                )}
                {selected.transit === "at_origin" && (
                  <button
                    className="button"
                    onClick={() =>
                      safe(() =>
                        act(
                          {
                            type: "set_transit_state",
                            payload: {
                              unitId: selected.id,
                              state: "in_transit",
                            },
                          },
                          [selected.id],
                        ),
                      )
                    }
                  >
                    <Truck size={18} />
                    Marcar cargada
                  </button>
                )}
                {selected.transit !== "at_destination" && (
                  <button
                    className="button"
                    onClick={() => {
                      workWith(selected);
                      sendText(`${selected.code} llegó a casa`);
                    }}
                  >
                    <House size={18} />
                    Llegó a casa
                  </button>
                )}
                {selected.transit === "at_destination" &&
                  selected.unpacking !== "not_applicable" &&
                  selected.unpacking !== "done" && (
                    <button
                      className="button"
                      onClick={() =>
                        ask(
                          "Terminar desempaque",
                          "Todas las entradas aún contenidas se marcarán como retiradas. Su nueva ubicación queda sin indicar.",
                          () =>
                            act(
                              {
                                type: "set_unpack_state",
                                payload: { unitId: selected.id, state: "done" },
                              },
                              [selected.id],
                            ),
                        )
                      }
                    >
                      <PackageOpen size={18} />
                      Terminar desempaque
                    </button>
                  )}
                {selected.count > 1 && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      openEditor({ type: "split", unit: selected })
                    }
                  >
                    Dividir lote
                  </button>
                )}
                <button
                  className="button danger"
                  onClick={() =>
                    ask(
                      selected.archived
                        ? "Restaurar unidad"
                        : "Archivar unidad",
                      "Se conserva el código y todo el historial.",
                      () =>
                        act(
                          {
                            type: selected.archived
                              ? "restore_unit"
                              : "archive_unit",
                            payload: { unitId: selected.id },
                          },
                          [selected.id],
                        ),
                    )
                  }
                >
                  {selected.archived ? "Restaurar" : "Archivar"}
                </button>
              </div>
              <h3>Historial</h3>
              <div className="timeline">
                {state.events
                  .filter((e) => e.changes.some((c) => c.id === selected.id))
                  .toReversed()
                  .map((e) => (
                    <div className="event" key={e.id}>
                      <span className="event-icon">
                        <Clock3 size={15} />
                      </span>
                      <div className="grow">
                        <strong>{e.actorName}</strong>
                        <p>
                          {state.receipts[e.operationId]?.receipt.summary ??
                            e.type.replaceAll("_", " ")}
                        </p>
                        <time>{time(e.at)}</time>
                        {e.type !== "undo_event" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              safe(() =>
                                act(
                                  {
                                    type: "undo_event",
                                    payload: { eventId: e.id },
                                  },
                                  e.changes.map((c) => c.id),
                                ),
                              )
                            }
                          >
                            Deshacer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
          {view === "move" && (
            <>
              <p className="eyebrow">Weston Hills → Savanna</p>
              <h1>Nuestra mudanza</h1>
              <p className="muted">
                Lo que falta cargar, entregar y desempacar.
              </p>
              <div className="stats">
                <div>
                  <strong>
                    {units.filter((u) => u.transit === "at_origin").length}
                  </strong>
                  <p>Falta cargar</p>
                </div>
                <div>
                  <strong>
                    {units.filter((u) => u.transit === "in_transit").length}
                  </strong>
                  <p>En camino</p>
                </div>
              </div>
              <div className="card yellow">
                <div className="row between">
                  <strong>
                    {units.filter((u) => u.transit === "at_destination").length}{" "}
                    de {units.length} ya llegaron
                  </strong>
                  <House size={20} />
                </div>
                <progress
                  max={Math.max(units.length, 1)}
                  value={
                    units.filter((u) => u.transit === "at_destination").length
                  }
                />
                <p className="small">
                  {session.demo
                    ? "Demo local"
                    : !family.online || pendingCount
                      ? "Copia local con pendientes"
                      : "Inventario confirmado"}{" "}
                  · registros de traslado
                </p>
              </div>
              <button
                className="link-row"
                onClick={() => {
                  setFilter("priority");
                  setKind("all");
                  setQuery("");
                  setRoom("");
                  navigate("inventory");
                }}
              >
                <Star size={18} />
                Abrir primero
                <span className="badge green">
                  {units.filter((u) => u.priority).length}
                </span>
                <ChevronRight size={18} />
              </button>
              <h3>Por ambiente</h3>
              {[...rooms, { key: "", name: "Sin asignar" }].map((r) => {
                const list = units.filter(
                  (u) => (u.destination ?? "") === r.key,
                );
                if (!list.length) return null;
                return (
                  <button
                    className="room-card"
                    key={r.key}
                    onClick={() => {
                      setRoom(r.key);
                      setKind("all");
                      setFilter(r.key ? "all" : "missing-room");
                      setQuery("");
                      navigate("inventory");
                    }}
                  >
                    <span className="room-icon">
                      <House size={20} />
                    </span>
                    <div className="grow">
                      <strong>{r.name}</strong>
                      <p className="small muted">
                        {list.length} unidades ·{" "}
                        {
                          list.filter((u) => u.transit === "at_destination")
                            .length
                        }{" "}
                        llegaron
                        <br />
                        {
                          list.filter((u) =>
                            ["not_started", "partial"].includes(u.unpacking),
                          ).length
                        }{" "}
                        contenedores por desempacar
                      </p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                );
              })}
              {!units.length && (
                <p className="muted">
                  Las unidades aparecen acá cuando empecemos a empacar.
                </p>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <h1>Ajustes</h1>
              <div className="card">
                <div className="row">
                  <span className="avatar">{actor?.nickname[0]}</span>
                  <div>
                    <strong>{actor?.nickname}</strong>
                    <p className="small muted">{session.email}</p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = String(
                      new FormData(e.currentTarget).get("nickname"),
                    ).trim();
                    safe(() =>
                      act(
                        {
                          type: "update_own_profile",
                          payload: { nickname: value },
                        },
                        [session.actorId],
                      ),
                    );
                  }}
                >
                  <label className="field">
                    Tu apodo
                    <input
                      name="nickname"
                      defaultValue={actor?.nickname}
                      maxLength={40}
                      required
                    />
                  </label>
                  <button className="text-button" type="submit">
                    Guardar apodo
                  </button>
                </form>
              </div>
              <button className="link-row" onClick={() => navigate("sync")}>
                <Clock3 size={19} />
                Sincronización
                <ChevronRight size={18} />
              </button>
              <button className="link-row" onClick={() => navigate("review")}>
                <Sofa size={19} />
                Revisar muebles históricos
                <ChevronRight size={18} />
              </button>
              <button
                className="link-row"
                onClick={() =>
                  safe(async () => {
                    const value = session.demo
                      ? exportInventory(doc.confirmed)
                      : await api<unknown>("exports?format=json");
                    download(
                      value,
                      session.demo
                        ? "gesualdo-demo.json"
                        : "gesualdo-respaldo.json",
                    );
                  })
                }
              >
                <Download size={19} />
                {session.demo
                  ? "Exportar demo · JSON"
                  : "Exportar respaldo compartido · JSON"}
                <ChevronRight size={18} />
              </button>
              <button
                className="link-row"
                onClick={() =>
                  download(
                    unitsCsv(state),
                    "unidades-copia-local.csv",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download size={19} />
                Exportar unidades locales · CSV
                <ChevronRight size={18} />
              </button>
              <button
                className="link-row"
                onClick={() =>
                  download(
                    offlineExport(doc),
                    "gesualdo-copia-local-pendientes.json",
                  )
                }
              >
                <Download size={19} />
                Exportar copia local y pendientes
                <ChevronRight size={18} />
              </button>
              <button className="link-row" onClick={() => navigate("install")}>
                <House size={19} />
                Instalar en el iPhone
                <ChevronRight size={18} />
              </button>
              <div className="card mint">
                <h3>Asistente</h3>
                <p>
                  {session.demo
                    ? "Demo con controles y reglas locales. No consume saldo."
                    : usage
                      ? `US$ ${Number(usage.spent).toFixed(3)} consumidos · ${Number(usage.reserved).toFixed(3)} reservados / ${usage.budget}. ${usage.enabled ? "Disponible" : "Desactivado"}.`
                      : "El consumo no está disponible en este momento."}
                </p>
                {!session.demo && usage?.enabled && (
                  <button
                    className="button secondary"
                    disabled={checkingAi || !family.online}
                    onClick={() =>
                      safe(async () => {
                        setCheckingAi(true);
                        try {
                          const key = doc.aiCheckId ?? crypto.randomUUID();
                          await family.write((local) => {
                            local.aiCheckId = key;
                          });
                          const result = await api<{ message: string }>(
                            "ai/check",
                            {
                              operationId: key,
                              expectedParticipantId: session.actorId,
                            },
                          );
                          setAiCheck(result.message);
                        } finally {
                          setCheckingAi(false);
                        }
                      })
                    }
                  >
                    {checkingAi
                      ? "Probando asistente…"
                      : "Probar conexión del asistente"}
                  </button>
                )}
                {aiCheck && <p role="status">{aiCheck}</p>}
                {!session.demo && doc.aiCheckId && (
                  <button
                    className="text-button"
                    onClick={() =>
                      ask(
                        "Nueva prueba del asistente",
                        "Se hará otra prueba pequeña con el presupuesto del asistente.",
                        async () => {
                          await family.write((local) => {
                            local.aiCheckId = undefined;
                          });
                          setAiCheck("");
                        },
                      )
                    }
                  >
                    Preparar otra prueba
                  </button>
                )}
                {usage &&
                  (Number(usage.spent) + Number(usage.reserved)) /
                    Number(usage.budget) >=
                    0.8 && (
                    <p className="notice">
                      El asistente usó el 80% o más de su presupuesto.
                    </p>
                  )}
                <p className="small muted">
                  Los controles manuales siguen disponibles si el asistente
                  alcanza el límite.
                </p>
              </div>
              <label className="toggle-row">
                <span>Animaciones suaves</span>
                <input
                  type="checkbox"
                  checked={motion}
                  onChange={(e) => setMotion(e.target.checked)}
                />
              </label>
              <button
                className="link-row"
                onClick={() =>
                  ask(
                    "Antes de salir",
                    `${pendingCount ? `${pendingCount} cambios pendientes quedan ligados a esta cuenta. Podés exportarlos antes de salir.` : "Tu inventario y conversación se conservan."} ${!family.online ? "Sin conexión se bloquea el acceso local; la salida del servidor queda pendiente." : ""}`,
                    async () => {
                      await family.logout();
                      navigate("chat");
                    },
                  )
                }
              >
                <LogOut size={19} />
                Cerrar sesión / cambiar cuenta
                <ChevronRight size={18} />
              </button>
            </>
          )}
          {view === "sync" && (
            <>
              <h1>Cambios pendientes</h1>
              <p className="muted">
                Los cambios pendientes están en este dispositivo. Los demás
                todavía no los ven.
              </p>
              <div className="card orange">
                <strong>
                  {family.online ? "Conexión disponible" : "Sin conexión"} ·{" "}
                  {pendingCount} pendientes
                </strong>
                <p className="small">
                  Última sincronización:{" "}
                  {doc.lastSync
                    ? time(doc.lastSync)
                    : session.demo
                      ? "Demo local · sin servidor"
                      : "Todavía no se confirmó"}
                </p>
              </div>
              {doc.queue.map((p) => (
                <div className="card" key={p.command.operationId}>
                  <div className="row between">
                    <strong>
                      {actionLabels[p.command.action.type] ??
                        "Corregir inventario"}
                    </strong>
                    <span className="badge orange">
                      {p.status === "review"
                        ? "Requiere revisión"
                        : "Pendiente"}
                    </span>
                  </div>
                  <p>
                    {p.error ?? "Se enviará conservando su autoría y orden."}
                  </p>
                  <p className="pending-description">
                    {pendingDescription(p.command, state)}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      const u = state.units.find((u) =>
                        p.entityIds.includes(u.id),
                      );
                      if (u) detail(u.id);
                    }}
                  >
                    Ver unidad actual
                  </button>
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      ask(
                        "Descartar solo este pedido",
                        "El pedido se elimina de la cola local. Los comandos que dependen de él se conservarán para revisión.",
                        async () => {
                          await family.write((d) => {
                            d.queue = d.queue.filter(
                              (item) =>
                                item.command.operationId !==
                                p.command.operationId,
                            );
                            for (const dependent of d.queue)
                              if (
                                dependent.entityIds.some((id) =>
                                  p.entityIds.includes(id),
                                )
                              ) {
                                dependent.status = "review";
                                dependent.error =
                                  "Se descartó un pedido anterior de esta unidad. Revisá los datos.";
                              }
                          });
                        },
                      )
                    }
                  >
                    Descartar pedido
                  </button>
                </div>
              ))}
              {doc.resolutions?.map((r) => (
                <div className="card" key={r.operationId}>
                  <strong>
                    {r.status
                      ? "Confirmación requiere revisión"
                      : "Confirmación pendiente"}
                  </strong>
                  <p>
                    {r.status ??
                      "Se enviará al recuperar conexión. Todavía no está guardada."}
                  </p>
                  {r.status && (
                    <button
                      className="text-button"
                      onClick={() =>
                        safe(() =>
                          family.write((local) => {
                            local.resolutions = local.resolutions?.filter(
                              (item) => item.operationId !== r.operationId,
                            );
                          }),
                        )
                      }
                    >
                      Descartar confirmación y repetir el pedido
                    </button>
                  )}
                </div>
              ))}
              {!pendingCount && (
                <div className="card mint">
                  <Check />
                  <p>
                    {session.demo
                      ? "Todo queda guardado en la demo local."
                      : "No hay comandos pendientes."}
                  </p>
                </div>
              )}
              <button
                className="button secondary"
                onClick={() => safe(family.sync)}
                disabled={family.busy}
              >
                Reintentar conexión
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    offlineExport(doc),
                    "gesualdo-copia-local-pendientes.json",
                  )
                }
              >
                <Download size={18} />
                Exportar copia y pendientes
              </button>
              {!session.demo && (
                <form action="/api/auth/google" method="POST">
                  <button className="button secondary">
                    Volver a ingresar con Google
                  </button>
                </form>
              )}
            </>
          )}
          {view === "review" && (
            <>
              <h1>¿Esto también va?</h1>
              <p className="muted">
                Referencias de la mudanza anterior. Todavía no están en nuestra
                lista.
              </p>
              <label className="search">
                <Search size={20} />
                <input
                  aria-label="Buscar referencias históricas"
                  placeholder="Nombre del objeto"
                  value={historicalQuery}
                  onChange={(e) => setHistoricalQuery(e.target.value)}
                />
              </label>
              <label className="toggle-row">
                Incluir Removed históricos
                <input
                  type="checkbox"
                  checked={showRemoved}
                  onChange={(e) => setShowRemoved(e.target.checked)}
                />
              </label>
              <p className="notice">
                Revisá si existe, el nombre, la cantidad y el destino. Las cajas
                y bolsas históricas empiezan vacías. Los precios de cotización
                no se importan.
              </p>
              {doc.importReview?.rows.length ? (
                <div className="card">
                  <strong>
                    {doc.importReview.rows.length} filas revisadas
                  </strong>
                  {doc.importReview.rows.map((r) => (
                    <p key={r.row}>
                      {r.exists
                        ? `${r.count} × ${r.name} · ${kindNames[r.kind]} · ${roomName(r.destination)}`
                        : `Excluir ${r.name}`}{" "}
                      · fila {r.row}
                    </p>
                  ))}
                  <p>
                    {doc.importReview.rows.filter((r) => r.exists).length} para
                    incluir;{" "}
                    {doc.importReview.rows.filter((r) => !r.exists).length}{" "}
                    excluidas.
                  </p>
                  <button
                    className="button"
                    disabled={importing || !family.online}
                    onClick={() =>
                      ask(
                        "Confirmar importación",
                        "Se incluirán únicamente las filas revisadas. Cajas y bolsas empezarán vacías. Podés reintentar un lote interrumpido.",
                        commitReviewedImport,
                      )
                    }
                  >
                    {importing
                      ? "Guardando lotes…"
                      : "Confirmar revisión por lotes"}
                  </button>
                </div>
              ) : null}
              {historicalCandidates
                .filter(
                  (c) =>
                    (showRemoved || c.action !== "Removed") &&
                    c.name
                      .toLowerCase()
                      .includes(historicalQuery.toLowerCase()),
                )
                .map((c) => {
                  const imported = state.units.find(
                    (u) =>
                      u.provenance?.source === c.source &&
                      u.provenance.row === c.row,
                  );
                  return (
                    <div className="card" key={c.row}>
                      <div className="row between">
                        <strong>{c.name}</strong>
                        <span
                          className={`badge ${c.action === "Removed" ? "orange" : "green"}`}
                        >
                          {imported
                            ? "Importada"
                            : importStatus[c.row] === "excluded"
                              ? "Excluida"
                              : c.action}
                        </span>
                      </div>
                      <p className="small muted">
                        Cantidad histórica: {c.count} · {c.oldRoom} · fila{" "}
                        {c.row}
                      </p>
                      {c.comment && (
                        <p className="small">
                          Comentario original: {c.comment}
                        </p>
                      )}
                      {c.warnings.map((w, i) => (
                        <p className="notice small" key={i}>
                          {w}
                        </p>
                      ))}
                      <button
                        className="text-button"
                        disabled={importStatus[c.row] === "excluded"}
                        onClick={() =>
                          imported
                            ? detail(imported.id)
                            : openEditor({ type: "import", candidate: c })
                        }
                      >
                        {imported
                          ? "Ver unidad"
                          : doc.importReview?.rows.some((r) => r.row === c.row)
                            ? "Editar revisión pendiente"
                            : "Revisar fila"}
                      </button>
                    </div>
                  );
                })}
            </>
          )}
          {view === "install" && (
            <>
              <h1>Agregar al inicio</h1>
              <div className={`home-art ${motion ? "moving" : ""}`}>
                <img src="/casa.png" alt="" />
              </div>
              {[
                "Abrí la app en Safari.",
                "Tocá Compartir en el navegador.",
                "Elegí Agregar a pantalla de inicio.",
                "Abrí Casa de los Gesualdo desde su ícono.",
              ].map((text, i) => (
                <div className="install-step" key={text}>
                  <span>{i + 1}</span>
                  <p>{text}</p>
                </div>
              ))}
              <p className="notice">
                Safari y la app instalada pueden pedir ingreso por separado. Usá
                la misma cuenta Google autorizada.
              </p>
            </>
          )}
        </div>
      )}
      {view !== "chat" && (
        <footer className="secondary-nav">
          <button onClick={() => navigate("chat")}>
            <MessageCircle size={17} />
            Volver al chat
          </button>
          <button onClick={() => navigate("menu")}>
            <MoreHorizontal size={17} />
            Menú
          </button>
        </footer>
      )}
      {editor && (
        <Modal
          title={
            {
              create: "Nueva unidad",
              unit: "Editar datos",
              content: editor.entry ? "Editar contenido" : "Agregar contenido",
              transfer: "Retirar o mover",
              split: "Dividir lote",
              split_content: "Separar contenido",
              correction: "Corregir estado",
              link: "Relacionar accesorio",
              import: "Revisar importación",
            }[editor.type]
          }
          close={() => setEditor(null)}
        >
          <form onSubmit={saveEditor}>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            {editor.type === "import" && (
              <label className="toggle">
                <span>Confirmo que existe y quiero incluirlo</span>
                <input
                  name="exists"
                  type="checkbox"
                  defaultChecked={
                    doc.importReview?.rows.find(
                      (r) => r.row === editor.candidate?.row,
                    )?.exists ?? editor.candidate?.action !== "Removed"
                  }
                />
              </label>
            )}
            {editor.type === "split_content" && (
              <>
                <p>
                  Se conserva la entrada original y su historial. La parte
                  separada seguirá en el mismo contenedor; después podés
                  moverla.
                </p>
                <label className="field">
                  Descripción de la parte
                  <textarea
                    name="description"
                    required
                    defaultValue={editor.entry?.description}
                  />
                </label>
                <label className="field">
                  Cantidad que separás
                  <input
                    name="quantity"
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    max={(editor.entry?.quantity ?? 1) - 0.01}
                  />
                </label>
              </>
            )}
            {editor.type === "correction" && (
              <>
                <p>
                  Esta corrección queda registrada con tu nombre. No vuelve a
                  guardar objetos retirados: para usar de nuevo el contenedor,
                  elegí Reabrir.
                </p>
                <label className="field">
                  Traslado
                  <select name="transit" defaultValue={editor.unit?.transit}>
                    <option value="at_origin">En Weston Hills</option>
                    <option value="in_transit">En camino</option>
                    <option value="at_destination">En Savanna</option>
                  </select>
                </label>
                <label className="field">
                  Ubicación real · se usa si llegó a Savanna
                  <select
                    name="room"
                    defaultValue={editor.unit?.actualRoom ?? ""}
                  >
                    <option value="">Sin confirmar</option>
                    {rooms.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                {editor.unit?.unpacking !== "not_applicable" && (
                  <label className="field">
                    Desempaque
                    <select
                      name="unpacking"
                      defaultValue={editor.unit?.unpacking}
                    >
                      <option value="not_started">Sin empezar</option>
                      <option value="partial">En curso</option>
                      <option value="done">Terminado · todo retirado</option>
                    </select>
                  </label>
                )}
                <label>
                  <input type="checkbox" name="confirm" required /> Confirmo el
                  nuevo estado y su efecto sobre el contenido
                </label>
              </>
            )}
            {["create", "import", "unit"].includes(editor.type) && (
              <>
                {editor.type !== "unit" && (
                  <label className="field">
                    Tipo
                    <select
                      name="kind"
                      defaultValue={
                        doc.importReview?.rows.find(
                          (r) => r.row === editor.candidate?.row,
                        )?.kind ??
                        (!editor.candidate || editor.candidate.container
                          ? "box"
                          : "furniture")
                      }
                    >
                      <option value="box">Caja · vacía</option>
                      <option value="bag">Bolsa · vacía</option>
                      <option value="furniture">Mueble</option>
                      <option value="other">Otro objeto</option>
                    </select>
                  </label>
                )}
                <label className="field">
                  Nombre o descripción
                  <input
                    name="name"
                    required
                    maxLength={4000}
                    defaultValue={
                      editor.unit?.name ??
                      doc.importReview?.rows.find(
                        (r) => r.row === editor.candidate?.row,
                      )?.name ??
                      editor.candidate?.name ??
                      ""
                    }
                  />
                </label>
                <RoomSelect
                  value={
                    editor.unit?.destination ??
                    doc.importReview?.rows.find(
                      (r) => r.row === editor.candidate?.row,
                    )?.destination
                  }
                />
                {editor.type !== "unit" && (
                  <label className="field">
                    Cantidad del lote · solo muebles y objetos
                    <input
                      name="count"
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      defaultValue={
                        doc.importReview?.rows.find(
                          (r) => r.row === editor.candidate?.row,
                        )?.count ??
                        editor.candidate?.count ??
                        1
                      }
                    />
                  </label>
                )}
                {editor.type === "unit" && (
                  <>
                    <label className="field">
                      Notas
                      <textarea
                        name="notes"
                        defaultValue={editor.unit?.notes}
                        maxLength={4000}
                      />
                    </label>
                    <label className="field">
                      Ubicación de origen · opcional
                      <input
                        name="source"
                        defaultValue={editor.unit?.source}
                        maxLength={4000}
                      />
                    </label>
                    <label className="field">
                      Tamaño · opcional
                      <select name="size" defaultValue={editor.unit?.size}>
                        <option value="">Sin indicar</option>
                        {["Pequeño", "Mediano", "Grande", "Otro"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label className="toggle-row">
                  Frágil
                  <input
                    type="checkbox"
                    name="fragile"
                    defaultChecked={editor.unit?.fragile}
                  />
                </label>
                <label className="toggle-row">
                  Abrir primero
                  <input
                    type="checkbox"
                    name="priority"
                    defaultChecked={editor.unit?.priority}
                  />
                </label>
                {editor.candidate && (
                  <>
                    <div className="card orange">
                      <strong>
                        Referencia histórica · fila {editor.candidate.row}
                      </strong>
                      <p>
                        {editor.candidate.comment || "Sin comentario original."}
                      </p>
                      {editor.candidate.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                      <p>
                        Se crea una unidad en preparación. No se copian
                        ubicación ni contenido antiguos.
                      </p>
                    </div>
                    {session.demo && (
                      <label className="toggle-row">
                        <span>Confirmo que existe y se muda</span>
                        <input type="checkbox" required />
                      </label>
                    )}
                  </>
                )}
              </>
            )}
            {editor.type === "content" && (
              <>
                <p className="notice">
                  {editor.unit?.code} · el texto se guarda completo. No hace
                  falta dividir cada objeto.
                </p>
                <label className="field">
                  Descripción
                  <textarea
                    name="description"
                    required
                    maxLength={4000}
                    defaultValue={editor.entry?.description}
                  />
                </label>
                <label className="field">
                  Cantidad · opcional
                  <input
                    name="quantity"
                    type="number"
                    min="0.01"
                    step="any"
                    defaultValue={editor.entry?.quantity ?? ""}
                    placeholder="Sin indicar"
                  />
                </label>
              </>
            )}
            {editor.type === "transfer" && (
              <>
                <p>{editor.entry?.description}</p>
                <RoomSelect label="¿Dónde quedó? · opcional" />
                <label className="field">
                  O mover a otra caja / bolsa
                  <select name="target">
                    <option value="">Retirar al ambiente indicado</option>
                    {state.units
                      .filter(
                        (u) =>
                          !u.archived &&
                          u.id !== editor.unit?.id &&
                          u.packing === "open" &&
                          u.unpacking !== "done",
                      )
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.code} · {u.name}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="notice">
                  Sin ambiente ni contenedor, se conserva la última caja como
                  referencia histórica.
                </p>
              </>
            )}
            {editor.type === "split" && (
              <>
                <p>
                  {editor.unit?.name} · {editor.unit?.count} objetos en total
                </p>
                <label className="field">
                  Cantidad a separar
                  <input
                    name="count"
                    type="number"
                    required
                    min={1}
                    max={(editor.unit?.count ?? 1) - 1}
                    step={1}
                  />
                </label>
                <RoomSelect />
              </>
            )}
            {editor.type === "link" && (
              <>
                <p>{editor.entry?.description}</p>
                <label className="field">
                  Pertenece a
                  <select name="target" required>
                    <option value="">Elegir mueble u objeto</option>
                    {state.units
                      .filter(
                        (u) =>
                          !u.archived &&
                          ["furniture", "other"].includes(u.kind),
                      )
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.code} · {u.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <button className="button" type="submit" disabled={family.busy}>
              {editor.type === "import"
                ? "Guardar revisión de esta fila"
                : editor.type === "create"
                  ? "Crear y trabajar con esta unidad"
                  : "Guardar cambio"}
            </button>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} close={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <button
            className="button"
            onClick={() =>
              safe(async () => {
                await confirm.run();
                setConfirm(null);
              })
            }
          >
            Confirmar
          </button>
          <button className="button secondary" onClick={() => setConfirm(null)}>
            Volver
          </button>
        </Modal>
      )}
    </main>
  );
}
