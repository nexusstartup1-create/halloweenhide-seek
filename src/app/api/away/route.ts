import { q } from "@/lib/db";
import { handler } from "@/lib/http";

/** Beacon sent when the app leaves the screen (locked, pocket, other app): chat pushes start right away. */
export const POST = handler(async (me) => {
  await q("update players set away = true where id = $1", [me.id]);
});
