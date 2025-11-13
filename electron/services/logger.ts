import path from "path";
import { promises as fs } from "fs";
import { ensureDir } from "../utils/fs";
import { resolveDataRoot } from "./settings";

let logFileCache: string | null = null;

export const appendLog = async (message: string) => {
  try {
    const dataRoot = resolveDataRoot();
    await ensureDir(dataRoot);
    const logDir = path.join(dataRoot, "logs");
    await ensureDir(logDir);
    if (!logFileCache) {
      logFileCache = path.join(logDir, "main.log");
    }
    await fs.appendFile(
      logFileCache,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf-8"
    );
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error("写入日志失败", error);
  }
};


