// Usage: npm run db:setup            creates missing tables
//        npm run db:setup -- --fresh  drops everything first (all games, players and proofs)
import pg from "pg";
import { DROP, SCHEMA } from "../src/lib/seed.mjs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();
try {
  if (process.argv.includes("--fresh")) {
    await client.query(DROP);
    console.log("Dropped all tables.");
  }
  await client.query(SCHEMA);
  console.log("Schema ready. Open the app and join the lobby.");
} finally {
  await client.end();
}
