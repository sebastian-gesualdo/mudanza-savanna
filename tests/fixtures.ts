import { command, Command, execute } from "../src/domain/commands";
import { emptyState, State } from "../src/domain/model";
export const actorId = "00000000-0000-4000-8000-000000000001";
export const secondActor = "00000000-0000-4000-8000-000000000002";
export const moveId = "00000000-0000-4000-8000-000000000003";
export const unitId = "00000000-0000-4000-8000-000000000004";
export const makeState = () =>
  emptyState(moveId, [
    { id: actorId, nickname: "Seba", version: 1 },
    { id: secondActor, nickname: "Lu", version: 1 },
  ]);
export function run(
  state: State,
  action: Command["action"],
  ids: string[] = [],
  actor = actorId,
) {
  const versions = Object.fromEntries(
    [...state.units, ...state.entries, ...state.links, ...state.participants]
      .filter((e) => ids.includes(e.id))
      .map((e) => [e.id, e.version]),
  );
  return execute(state, command(actor, action, versions), actor).state;
}
export const withBox = (destination: string | null = "kitchen") =>
  run(makeState(), {
    type: "create_unit",
    payload: { id: unitId, kind: "box", name: "Vajilla", destination },
  });
