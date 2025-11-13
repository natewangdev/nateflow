import { existsSync } from "fs";
import { promises as fs } from "fs";
import path from "path";

export const ensureDir = async (dirPath: string) => {
  if (!existsSync(dirPath)) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

export const readJSON = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const buffer = await fs.readFile(filePath, "utf-8");
    return JSON.parse(buffer) as T;
  } catch (error: unknown) {
    return fallback;
  }
};

export const writeJSON = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
};


