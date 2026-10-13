import "./environment";
import { z } from "zod";
import { database, lockMove, transaction } from "../src/server/database";
const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const p = a.indexOf("=");
    return [a.slice(2, p), a.slice(p + 1)];
  }),
);
const action = process.argv[2];
const moveId = z.uuid().parse(args.move);
const pool = database();
try {
  await transaction(pool, async (client) => {
    await lockMove(client, moveId);
    if (action === "list") {
      console.table(
        (
          await client.query(
            "select m.email_normalized,m.active,m.participant_id,m.auth_user_id,p.data->>'nickname' nickname from move_memberships m join participants p on p.id=m.participant_id where m.move_id=$1",
            [moveId],
          )
        ).rows,
      );
      return;
    }
    const email = z.email().parse(args.email).trim().toLowerCase();
    if (action === "link") {
      const authUserId = z.uuid().parse(args["auth-user"]);
      const updated = await client.query(
        "update move_memberships set auth_user_id=$3,linked_at=now() where move_id=$1 and email_normalized=$2 returning id",
        [moveId, email, authUserId],
      );
      if (!updated.rowCount)
        throw new Error(
          "Autorizar primero el correo y elegir explícitamente su participante.",
        );
      console.log(
        "Vínculo Auth actualizado por administración; participante e historial conservados.",
      );
      return;
    }
    if (action === "revoke") {
      await client.query(
        "update move_memberships set active=false,revoked_at=now() where move_id=$1 and email_normalized=$2",
        [moveId, email],
      );
      console.log("Acceso desactivado; historial conservado.");
      return;
    }
    if (action !== "add")
      throw new Error(
        "Uso: members add|revoke|list --move=UUID --email=CORREO --nickname=APODO [--participant=UUID restaurado]",
      );
    const existing = (
      await client.query(
        "select * from move_memberships where move_id=$1 and email_normalized=$2",
        [moveId, email],
      )
    ).rows[0];
    if (existing) {
      if (args.participant && existing.participant_id !== args.participant)
        throw new Error(
          "El correo ya corresponde a otro participante. Revisar vínculo explícitamente.",
        );
      await client.query(
        "update move_memberships set active=true,revoked_at=null where id=$1",
        [existing.id],
      );
      console.log("Membresía existente activada.");
      return;
    }
    const participantId = args.participant
      ? z.uuid().parse(args.participant)
      : crypto.randomUUID();
    if (args.participant) {
      if (
        !(
          await client.query(
            "select id from participants where id=$1 and move_id=$2",
            [participantId, moveId],
          )
        ).rowCount
      )
        throw new Error("Participante restaurado no encontrado.");
    } else {
      const nickname = z.string().trim().min(1).max(40).parse(args.nickname);
      await client.query(
        "insert into participants(id,move_id,data) values($1,$2,$3)",
        [participantId, moveId, { id: participantId, nickname, version: 1 }],
      );
    }
    await client.query(
      "insert into move_memberships(id,move_id,participant_id,email_normalized) values($1,$2,$3,$4)",
      [crypto.randomUUID(), moveId, participantId, email],
    );
    console.log(
      "Correo autorizado; el primer Google Login vinculará su cuenta.",
    );
  });
} finally {
  await pool.end();
}
