import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";

// Small JSON-file store. Writes go through a queue per file and are atomic
// (write to a temp file, then rename), so concurrent orders never corrupt the file.
export function createJsonStore(dir) {
  const queues = new Map();

  async function read(name, fallback) {
    try {
      return JSON.parse(await readFile(path.join(dir, name), "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return fallback;
      throw err;
    }
  }

  function update(name, fallback, change) {
    const prev = queues.get(name) || Promise.resolve();
    const next = prev.then(async () => {
      const data = await read(name, fallback);
      const result = change(data);
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, name);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
      await rename(tmp, file);
      return result;
    });
    queues.set(name, next.catch(() => {}));
    return next;
  }

  return { read, update };
}
