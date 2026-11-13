import { runSeed } from "../seed/run-seed.js";
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED (owner, direct) is required to seed");
const res = await runSeed(url, { secretsFile: ".data/dev-qr-secrets.json" });
console.log(`seeded ${res.quests} quests, ${res.steps} steps, ${res.places} places (all PLACEHOLDER)`);
