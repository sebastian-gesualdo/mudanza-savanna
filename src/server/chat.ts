import { Pool } from "pg";
import { z } from "zod";
import { ChatReply, Clarification, interpret } from "../domain/chat";
import { commandSchema } from "../domain/commands";
import { canonical, DomainError } from "../domain/model";
import { assist, semanticSearch } from "../ai/pipeline";
import {
  Actor,
  checkMembership,
  database,
  executeInTransaction,
  loadState,
  lockMove,
  transaction,
} from "./database";
export const chatRequestSchema = z
  .object({
    messageId: z.uuid(),
    conversationId: z.uuid(),
    expectedParticipantId: z.uuid(),
    text: z.string().trim().min(1).max(4000),
    activeUnitId: z.uuid().nullable(),
    literal: z.boolean().default(false),
    clarification: z
      .union([
        z.object({
          type: z.literal("create"),
          kind: z.enum(["box", "bag", "furniture", "other"]),
          name: z.string().max(4000),
        }),
        z.object({
          type: z.enum(["arrival", "destination"]),
          unitId: z.uuid(),
        }),
      ])
      .optional(),
    structuredCommand: commandSchema.optional(),
    deviceId: z.uuid(),
  })
  .strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = ChatReply & {
  receipt?: Awaited<ReturnType<typeof executeInTransaction>>;
};
export async function processMessage(
  actor: Actor,
  raw: unknown,
  pool: Pool = database(),
  assistant = assist,
): Promise<ChatResponse> {
  const b = chatRequestSchema.parse(raw);
  if (b.expectedParticipantId !== actor.participantId)
    throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
  if (
    b.structuredCommand &&
    (b.structuredCommand.operationId !== b.messageId ||
      b.structuredCommand.expectedParticipantId !== actor.participantId)
  )
    throw new DomainError(
      "MESSAGE_COMMAND",
      "El comando no corresponde a este mensaje.",
      409,
    );
  const token = crypto.randomUUID();
  const claim = await transaction(pool, async (client) => {
    await lockMove(client, actor.moveId);
    await checkMembership(client, actor);
    if (
      !(
        await client.query(
          "select id from conversations where id=$1 and move_id=$2 and participant_id=$3",
          [b.conversationId, actor.moveId, actor.participantId],
        )
      ).rowCount
    )
      throw new DomainError("NOT_FOUND", "Conversación no encontrada.", 404);
    const prior = (
      await client.query("select * from messages where id=$1", [b.messageId])
    ).rows[0];
    if (prior) {
      if (
        prior.move_id !== actor.moveId ||
        prior.participant_id !== actor.participantId ||
        prior.conversation_id !== b.conversationId ||
        prior.request_hash !== canonical(b)
      )
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "El mensaje tiene otros datos.",
          409,
        );
      if (prior.response) return { response: prior.response as ChatResponse };
      if (
        prior.lease_until &&
        new Date(prior.lease_until).getTime() > Date.now()
      )
        return {
          response: {
            text: "Estoy revisando tu mensaje. Se conserva en este dispositivo.",
            processing: true,
          } as ChatResponse,
        };
      if (prior.attempts >= 3)
        throw new DomainError(
          "MESSAGE_REVIEW",
          "Este mensaje necesita revisión. Tu texto se conserva.",
          409,
        );
      await client.query(
        "update messages set lease_token=$2,lease_until=now()+interval '75 seconds',attempts=attempts+1,updated_at=now() where id=$1",
        [b.messageId, token],
      );
    } else
      await client.query(
        "insert into messages(id,move_id,participant_id,conversation_id,request_hash,request,status,lease_token,lease_until,attempts) values($1,$2,$3,$4,$5,$6,'processing',$7,now()+interval '75 seconds',1)",
        [
          b.messageId,
          actor.moveId,
          actor.participantId,
          b.conversationId,
          canonical(b),
          b,
          token,
        ],
      );
    return { state: await loadState(client, actor.moveId) };
  });
  if (claim.response) return claim.response;
  const state = claim.state!;
  if (
    b.activeUnitId &&
    !state.units.some((u) => u.id === b.activeUnitId && !u.archived)
  )
    throw new DomainError("NOT_FOUND", "Caja activa no encontrada.", 404);
  let reply: ChatReply;
  try {
    if (b.structuredCommand || b.clarification)
      reply = interpret(
        state,
        actor.participantId,
        b.text,
        b.activeUnitId,
        b.literal,
        b.clarification as Clarification,
      );
    else if (b.text.startsWith("/buscar-mas ")) {
      const match = b.text.match(/^\/buscar-mas (\d{1,6}) (.+)$/s);
      if (!match)
        throw new DomainError("INVALID_SEARCH", "Repetí la búsqueda.", 400);
      const result = await semanticSearch(
        actor,
        match[2],
        b.messageId,
        Number(match[1]),
        pool,
      );
      reply = {
        text: `${result.message} Revisé ${result.scope}.`,
        hits: result.hits,
        ...(result.nextOffset !== null
          ? {
              choices: [
                {
                  label: "Buscar más",
                  text: `/buscar-mas ${result.nextOffset} ${match[2]}`,
                },
              ],
            }
          : {}),
      };
    } else
      reply = await assistant(
        actor,
        state,
        b.text,
        b.activeUnitId,
        b.literal,
        b.messageId,
        pool,
      );
  } catch (error) {
    // Paid calls with uncertain outcomes retain their budget reservation and cannot be redispatched.
    reply = {
      text:
        error instanceof DomainError
          ? error.message
          : "No pude consultar al asistente. Tu mensaje se conserva; podés usar el botón +.",
    };
  }
  return transaction(pool, async (client) => {
    await lockMove(client, actor.moveId);
    await checkMembership(client, actor);
    const row = (
      await client.query(
        "select * from messages where id=$1 and lease_token=$2",
        [b.messageId, token],
      )
    ).rows[0];
    if (!row)
      throw new DomainError(
        "MESSAGE_LEASE",
        "Otro intento está recuperando este mensaje.",
        409,
      );
    if (row.response) return row.response;
    const receipt = b.structuredCommand
      ? await executeInTransaction(
          client,
          actor,
          b.structuredCommand,
          b.deviceId,
        )
      : undefined;
    if (reply.command && !b.structuredCommand)
      reply = {
        ...reply,
        text: "Revisá y confirmá el cambio antes de guardarlo.",
        choices: [
          {
            label: "Confirmar cambio",
            action: reply.command.action,
            versions: reply.command.expectedVersions,
          },
        ],
      };
    if (b.structuredCommand) {
      const action = b.structuredCommand.action;
      const actions =
        action.type === "compound" ? action.payload.actions : [action];
      const created = actions.filter((a) => a.type === "create_unit").at(-1);
      reply.activeUnitId = created?.payload.id ?? b.activeUnitId ?? undefined;
      if (created)
        reply.literal =
          created.payload.kind === "box" || created.payload.kind === "bag";
    } else if (reply.command?.action.type === "create_unit") {
      reply.activeUnitId = undefined;
      reply.literal = undefined;
    }
    const expiresAt = new Date(Date.now() + 600000).toISOString();
    const response: ChatResponse = {
      ...reply,
      command: undefined,
      receipt,
      text: receipt?.summary ?? reply.text,
      expiresAt,
      choices: reply.choices?.map((choice, choiceIndex) => ({
        ...choice,
        ...(choice.action
          ? { proposal: { messageId: b.messageId, choiceIndex } }
          : {}),
      })),
    };
    await client.query(
      "update messages set response=$2,status=$3,lease_until=null,updated_at=now() where id=$1 and lease_token=$4",
      [
        b.messageId,
        response,
        receipt
          ? "applied"
          : response.choices?.length
            ? "needs_clarification"
            : "answered",
        token,
      ],
    );
    return response;
  });
}
export async function resolveProposal(
  actor: Actor,
  messageId: string,
  raw: unknown,
  pool = database(),
) {
  const b = z
    .object({
      operationId: z.uuid(),
      choiceIndex: z.number().int().nonnegative().max(100),
      expectedParticipantId: z.uuid(),
      deviceId: z.uuid(),
    })
    .strict()
    .parse(raw);
  if (b.expectedParticipantId !== actor.participantId)
    throw new DomainError("ACTOR_MISMATCH", "La cuenta cambió.", 409);
  return transaction(pool, async (client) => {
    await lockMove(client, actor.moveId);
    await checkMembership(client, actor);
    const row = (
      await client.query(
        "select response from messages where id=$1 and move_id=$2 and participant_id=$3",
        [messageId, actor.moveId, actor.participantId],
      )
    ).rows[0];
    const response = row?.response as ChatResponse | undefined;
    const choice = response?.choices?.[b.choiceIndex];
    if (!choice?.action)
      throw new DomainError(
        "PROPOSAL_NOT_FOUND",
        "Propuesta no encontrada.",
        404,
      );
    // The original proposal fixes the operation identity: two confirmations cannot apply twice.
    const operationId = (await import("../ai/pipeline")).stableId(
      `${messageId}:resolve:${b.choiceIndex}`,
    );
    const current = await loadState(client, actor.moveId);
    if (current.receipts[operationId])
      return { receipt: current.receipts[operationId].receipt };
    if (!response?.expiresAt || Date.parse(response.expiresAt) < Date.now())
      throw new DomainError(
        "PROPOSAL_EXPIRED",
        "La propuesta venció. Repetí el pedido para revisar los datos actuales.",
        409,
      );
    for (const [id, version] of Object.entries(choice.versions ?? {})) {
      const entity = [
        ...current.units,
        ...current.entries,
        ...current.links,
        ...current.participants,
      ].find((e) => e.id === id);
      if (entity?.version !== version)
        throw new DomainError(
          "VERSION_CONFLICT",
          "Los datos de esta propuesta cambiaron. Repetí el pedido antes de confirmar.",
          409,
        );
    }
    const receipt = await executeInTransaction(
      client,
      actor,
      {
        operationId,
        expectedParticipantId: actor.participantId,
        expectedVersions: choice.versions ?? {},
        action: choice.action,
      },
      b.deviceId,
    );
    // Return the client's durable resolution UUID while preserving the canonical receipt ID.
    return { receipt, resolutionId: b.operationId };
  });
}
