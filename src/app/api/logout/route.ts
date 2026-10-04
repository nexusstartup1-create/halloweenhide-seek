import { endSession } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST() {
  await endSession();
  return json({ ok: true });
}
