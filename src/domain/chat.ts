import { command, Command, versionsFor } from "./commands";
import {
  contents,
  Kind,
  kindNames,
  normalize,
  roomName,
  rooms,
  State,
} from "./model";
import { normalizeCode, search, SearchHit, unitSummary } from "./search";

export interface Choice {
  label: string;
  action?: Command["action"];
  text?: string;
  activeUnitId?: string;
  versions?: Record<string, number>;
}
export interface ChatReply {
  text: string;
  command?: Command;
  hits?: SearchHit[];
  choices?: Choice[];
  activeUnitId?: string;
  literal?: boolean;
  clarification?: Clarification;
}
export type Clarification =
  | { type: "create"; kind: Kind; name: string }
  | { type: "arrival" | "destination"; unitId: string };
export function resolveRoom(text: string) {
  const q = normalize(text).replace(/[.!?¿¡]/g, "");
  const exact = rooms.filter((r) =>
    [r.name, ...r.aliases].some((a) => normalize(a) === q),
  );
  if (exact.length === 1) return exact[0];
  const matches = rooms.filter((r) =>
    r.aliases.some((a) =>
      new RegExp(
        `(?:^|\\b)${normalize(a).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\b)`,
      ).test(q),
    ),
  );
  return matches.length === 1 ? matches[0] : null;
}
export function interpret(
  state: State,
  actorId: string,
  text: string,
  activeUnitId: string | null,
  literal = false,
  clarification?: Clarification,
): ChatReply {
  const q = normalize(text)
    .replace(/[¿¡?!]/g, "")
    .replace(/\.$/, "")
    .trim();
  const english =
    /^(where|what|how|create|new|close|reopen|load|arrived|unpack|find|search)\b/.test(
      q,
    );
  const say = (es: string, en: string) => (english ? en : es);
  const make = (action: Command["action"], ids: string[] = []): ChatReply => ({
    text: "",
    command: command(actorId, action, versionsFor(state, ids)),
  });
  const roomChoices = (
    build: (key: string | null) => Choice,
    nullable = false,
  ) => [
    ...rooms.map((r) => ({ ...build(r.key), label: r.name })),
    ...(nullable ? [{ ...build(null), label: "No sé el ambiente" }] : []),
  ];
  if (clarification) {
    const room = resolveRoom(text);
    if (clarification.type === "create") {
      if (!room)
        return {
          text: "¿A qué ambiente va?",
          clarification,
          choices: roomChoices((key) => ({ label: "", text: roomName(key) })),
        };
      const id = crypto.randomUUID();
      return {
        ...make({
          type: "create_unit",
          payload: {
            id,
            kind: clarification.kind,
            name: clarification.name,
            destination: room.key,
          },
        }),
        activeUnitId: id,
        literal: ["box", "bag"].includes(clarification.kind),
      };
    }
    const u = state.units.find(
      (u) => u.id === clarification.unitId && !u.archived,
    );
    if (!u)
      return { text: "Esta unidad cambió. Consultá su ficha para continuar." };
    if (room || /^(no se|sin confirmar|unknown)$/.test(q))
      return make(
        clarification.type === "arrival"
          ? {
              type: "set_transit_state",
              payload: {
                unitId: u.id,
                state: "at_destination",
                actualRoom: room?.key ?? null,
              },
            }
          : {
              type: "update_unit",
              payload: {
                unitId: u.id,
                patch: { destination: room?.key ?? null },
              },
            },
        [u.id],
      );
    return {
      text: "Elegí el ambiente o escribí su nombre.",
      clarification,
      choices: roomChoices(
        (key) => ({ label: "", text: roomName(key) }),
        clarification.type === "arrival",
      ),
    };
  }
  const codeMention = text.match(/\b([cbmo])[-\s]*0*(\d+)\b/i);
  const explicitCode = codeMention ? normalizeCode(codeMention[0]) : null;
  let unit = explicitCode
    ? state.units.find((u) => !u.archived && u.code === explicitCode)
    : state.units.find((u) => u.id === activeUnitId && !u.archived);
  if (explicitCode && !unit)
    return {
      text: say(
        `No encontré ${explicitCode}.`,
        `I couldn't find ${explicitCode}.`,
      ),
    };
  const number = q.match(
    /^(?:la|el|caja|bolsa|the)\s+(?:caja\s+|bolsa\s+)?(\d+)\b/,
  );
  if (!explicitCode && number) {
    const candidates = state.units.filter(
      (u) => !u.archived && Number(u.code.slice(2)) === Number(number[1]),
    );
    if (candidates.length !== 1)
      return {
        text: "¿A cuál te referís? Todavía no cambié el inventario.",
        choices: candidates.map((u) => ({
          label: `${u.code} · ${u.name}`,
          text: text.replace(number[0], u.code),
        })),
      };
    unit = candidates[0];
  }
  if (
    /^(?:estoy (?:armando|preparando|empacando).*\b(?:caja|bolsa)|(?:crea|crear|nueva|nuevo|create|new)\b)/.test(
      q,
    )
  ) {
    const kind: Kind = /bolsa|bag/.test(q)
      ? "bag"
      : /mueble|furniture/.test(q)
        ? "furniture"
        : /objeto|object/.test(q)
          ? "other"
          : "box";
    const room = resolveRoom(text);
    const name = `${kindNames[kind]}${room ? ` para ${room.name}` : ""}`;
    if (!room)
      return {
        text: say("¿A qué ambiente va?", "Which room is it going to?"),
        clarification: { type: "create", kind, name },
        choices: roomChoices((key) => ({ label: "", text: roomName(key) })),
      };
    const id = crypto.randomUUID();
    return {
      ...make({
        type: "create_unit",
        payload: { id, kind, name, destination: room.key },
      }),
      activeUnitId: id,
      literal: kind === "box" || kind === "bag",
    };
  }
  if (/^(?:que hay|que queda|what is|what's|contents)/.test(q))
    return unit
      ? {
          text: unitSummary(state, unit),
          hits: [
            {
              unit,
              evidence:
                contents(state, unit.id)
                  .map((e) => e.description)
                  .join("; ") || "Sin contenido registrado",
              historical: false,
              whereabouts: unitSummary(state, unit),
            },
          ],
        }
      : { text: "Indicá el código de la caja que querés consultar." };
  if (/^(?:cuantas|cuantos|que falta|how many|what.*left)/.test(q)) {
    const r = resolveRoom(text);
    const list = state.units.filter(
      (u) =>
        !u.archived &&
        (!r || u.destination === r.key) &&
        (!/cajas|boxes/.test(q) || u.kind === "box"),
    );
    const origin = list.filter((u) => u.transit === "at_origin").length;
    const transit = list.filter((u) => u.transit === "in_transit").length;
    return {
      text: say(
        `${origin + transit} unidades todavía no llegaron${r ? ` de ${r.name}` : ""}: ${origin} por cargar y ${transit} en camino.`,
        `${origin + transit} units have not arrived: ${origin} awaiting pickup and ${transit} in transit.`,
      ),
    };
  }
  if (/^(?:donde|buscar|busca|encontra|where|find|search)\b/.test(q)) {
    const query = q
      .replace(
        /^(?:donde (?:esta|estan)(?: el| la| los| las)?|buscar|busca|encontra|where (?:is|are)(?: the)?|find|search)\s*/,
        "",
      )
      .replace(/\.$/, "");
    const hits = search(state, query);
    return {
      text: hits.length
        ? say(
            `Encontré ${hits.length} coincidencia${hits.length === 1 ? "" : "s"}. Esta es la información registrada:`,
            `I found ${hits.length} match(es). Here is the recorded information:`,
          )
        : say(
            "No encontré coincidencias. Podés probar otra descripción.",
            "I found no matches. Try another description.",
          ),
      hits,
    };
  }
  if (/^(?:trabajar|usar|use|work)\b/.test(q) && unit)
    return {
      text: `Ahora trabajás con ${unit.code}.`,
      activeUnitId: unit.id,
      literal: unit.packing === "open",
    };
  if (/^(?:cerra|cerrala|cerrar|cerralo|close)(?:\b|$)/.test(q)) {
    if (!unit) return { text: "Elegí primero la caja o bolsa." };
    if (!unit.destination)
      return {
        text: "¿A qué ambiente va? Después podés cerrarla.",
        clarification: { type: "destination", unitId: unit.id },
        choices: roomChoices((key) => ({ label: "", text: roomName(key) })),
      };
    if (!contents(state, unit.id).length)
      return {
        text: "No tiene contenido registrado. ¿Está vacía?",
        choices: [
          {
            label: "Confirmo que está vacía · cerrar",
            action: {
              type: "close_unit",
              payload: { unitId: unit.id, declaredEmpty: true },
            },
            versions: versionsFor(state, [unit.id]),
          },
        ],
      };
    return {
      ...make({ type: "close_unit", payload: { unitId: unit.id } }, [unit.id]),
      literal: false,
    };
  }
  if (/^(?:reabr|reopen)/.test(q))
    return unit
      ? make({ type: "reopen_unit", payload: { unitId: unit.id } }, [unit.id])
      : { text: "Indicá qué caja querés reabrir." };
  if (/\b(?:cargado|cargada|cargo|cargar|load|loaded)\b/.test(q))
    return unit
      ? make(
          {
            type: "set_transit_state",
            payload: { unitId: unit.id, state: "in_transit" },
          },
          [unit.id],
        )
      : { text: "Indicá el código que se cargó." };
  if (/\b(?:llego|llegaron|llegada|arrived)\b/.test(q)) {
    if (!unit) return { text: "Indicá qué unidad llegó." };
    if (/\b(?:tres|dos|\d+) de (?:las|los|\d+)\b/.test(q) || unit.count > 1)
      return {
        text: "Es un lote. Confirmá la cantidad desde Dividir lote antes de registrar una llegada parcial.",
      };
    const r = resolveRoom(text);
    if (r)
      return make(
        {
          type: "set_transit_state",
          payload: {
            unitId: unit.id,
            state: "at_destination",
            actualRoom: r.key,
          },
        },
        [unit.id],
      );
    return {
      text: `¿Dónde quedó ${unit.code}? Su destino previsto es ${roomName(unit.destination)}.`,
      clarification: { type: "arrival", unitId: unit.id },
      choices: roomChoices(
        (key) => ({ label: "", text: key ? roomName(key) : "No sé" }),
        true,
      ),
    };
  }
  if (
    /^(?:terminar desempaque|termine de desempacar|desempacar|unpack)/.test(
      q,
    ) &&
    unit
  )
    return {
      text: `Se marcará todo el contenido de ${unit.code} como retirado. Su nueva ubicación quedará sin indicar.`,
      choices: [
        {
          label: "Confirmar caja vacía",
          action: {
            type: "set_unpack_state",
            payload: { unitId: unit.id, state: "done" },
          },
          versions: versionsFor(state, [unit.id]),
        },
      ],
    };
  if (/^(?:saca|retira|retirar|remove)\b/.test(q) && unit) {
    const query = q
      .replace(/^(?:saca|retira|retirar|remove)\s+(?:el |la |the )?/, "")
      .split(/ de | from | y | and /)[0];
    const matches = contents(state, unit.id).filter((e) =>
      normalize(e.description).includes(query),
    );
    if (matches.length !== 1)
      return {
        text: "¿Qué entrada completa querés retirar?",
        choices: contents(state, unit.id).map((e) => ({
          label: e.description,
          text: `Retirar ${e.description} de ${unit.code}`,
        })),
      };
    const e = matches[0];
    return {
      text: `¿Retirar “${e.description}”?${!resolveRoom(text) ? " No se registró dónde quedó." : ""}`,
      choices: [
        {
          label: "Confirmar retiro",
          action: {
            type: "unpack_content",
            payload: { entryId: e.id, room: resolveRoom(text)?.key ?? null },
          },
          versions: versionsFor(state, [unit.id, e.id]),
        },
      ],
    };
  }
  if (/\b(?:va a|va al|va para|goes to)\b/.test(q) && unit) {
    const r = resolveRoom(text);
    return r
      ? make(
          {
            type: "update_unit",
            payload: { unitId: unit.id, patch: { destination: r.key } },
          },
          [unit.id],
        )
      : {
          text: "¿A qué ambiente va?",
          clarification: { type: "destination", unitId: unit.id },
          choices: roomChoices((key) => ({ label: "", text: roomName(key) })),
        };
  }
  if (/^(?:agrega|agregar|add)\b/.test(q) && unit) {
    const m = text.match(
      /^(?:agreg[aá]|agregar|add)\s+(.+?)(?:\s+(?:a|to)\s+[CBMO][-\s]*\d+)?\s+(?:y cerrala|y cerrar|and close(?: it)?)\.?$/i,
    );
    if (m)
      return make(
        {
          type: "compound",
          payload: {
            actions: [
              {
                type: "append_content",
                payload: {
                  unitId: unit.id,
                  id: crypto.randomUUID(),
                  description: m[1],
                },
              },
              { type: "close_unit", payload: { unitId: unit.id } },
            ],
          },
        },
        [unit.id],
      );
    const description = text.replace(/^(?:agreg[aá]|agregar|add)\s+/i, "");
    return make({
      type: "append_content",
      payload: { unitId: unit.id, id: crypto.randomUUID(), description },
    });
  }
  if (literal && unit)
    return make({
      type: "append_content",
      payload: { unitId: unit.id, id: crypto.randomUUID(), description: text },
    });
  return {
    text: say(
      "Necesito un dato más. Podés indicar una caja, buscar algo o usar los controles del botón +. Tu mensaje se conserva.",
      "I need more detail. Specify a unit, search for an item, or use the + controls. Your message is preserved.",
    ),
  };
}
