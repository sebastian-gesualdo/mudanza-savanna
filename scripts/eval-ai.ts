import { readFile } from "node:fs/promises";
import { interpret } from "../src/domain/chat";
import { actorId, run, unitId, withBox } from "../tests/fixtures";
const cases = JSON.parse(await readFile("tests/ai-cases.json", "utf8")) as {
  text: string;
  command: string | null;
  replyIncludes?: string;
}[];
const state = run(withBox(), {
  type: "append_content",
  payload: { id: crypto.randomUUID(), unitId, description: "Pava eléctrica" },
});
let passed = 0;
for (const example of cases) {
  const reply = interpret(state, actorId, example.text, unitId);
  const correct =
    (reply.command?.action.type ?? null) === example.command &&
    (!example.replyIncludes || reply.text.includes(example.replyIncludes));
  if (correct) passed++;
  else
    console.error("Caso fallido:", example.text, {
      expected: example.command,
      actual: reply.command?.action.type,
      reply: reply.text,
    });
}
console.log(
  `Ruta determinista offline: ${passed}/${cases.length} casos etiquetados. Jev y generación live: no ejecutados; costo/latencia de proveedor no medidos.`,
);
if (passed !== cases.length) process.exitCode = 1;
