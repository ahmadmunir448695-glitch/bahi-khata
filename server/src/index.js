import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const root = path.dirname(fileURLToPath(import.meta.url));

const app = await createApp({
  dataDir: process.env.DATA_DIR || path.join(root, "../data"),
  clientDir: path.join(root, "../../client/dist"),
  secret: process.env.SESSION_SECRET,
});

const port = Number(process.env.PORT) || 3003;
app.listen(port, () => console.log(`Bahi running on http://localhost:${port}`));
