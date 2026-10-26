import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase, migrate } from "./db/client.js";

const config = loadConfig();
const database = await createDatabase(config.DATABASE_URL);
const applied = await migrate(database);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

const server = createApp(database.db, config).listen(config.PORT, () => {
  console.log(`TrabaHub API on http://localhost:${config.PORT} (docs at /docs)`);
});

const shutdown = () => {
  server.close(() => void database.close().then(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
