import path from "path";
import { existsSync, promises as fs } from "fs";
import { randomUUID } from "crypto";
import type { Task, TaskPayload } from "../../src/shared/types";
import { ensureDir, readJSON, writeJSON } from "../utils/fs";
import { getProjectPath } from "./settings";
import {
  clearTasksCache,
  getTasksCache,
  setTasksCache
} from "../state/cache";

const getTasksDir = async (projectId: string) =>
  path.join(await getProjectPath(projectId), "tasks");

const getTaskFilePath = async (projectId: string, taskId: string) =>
  path.join(await getTasksDir(projectId), `${taskId}.json`);

const normalizeTaskActionIds = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) {
    throw new Error("Task actions 必须是数组");
  }
  return raw.map((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
    if (typeof item === "object" && item !== null && "id" in item) {
      const candidate = (item as { id?: unknown }).id;
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    throw new Error(`Task actions[${index}] 缺少有效的动作标识`);
  });
};

export const listTasks = async (projectId: string): Promise<Task[]> => {
  const cached = getTasksCache(projectId);
  if (cached) {
    return cached;
  }

  const tasksDir = await getTasksDir(projectId);
  await ensureDir(tasksDir);
  const entries = await fs.readdir(tasksDir, { withFileTypes: true });
  const tasks: Task[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(tasksDir, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        id?: string;
        name?: string;
        actionIds?: unknown;
        actions?: unknown;
        createdAt?: string;
        updatedAt?: string;
      };
      if (!parsed.id || !parsed.name) {
        continue;
      }
      let actionIds: string[] = [];
      let migrated = false;
      try {
        if (Array.isArray(parsed.actionIds)) {
          actionIds = normalizeTaskActionIds(parsed.actionIds);
        } else if (Array.isArray(parsed.actions)) {
          actionIds = normalizeTaskActionIds(parsed.actions);
          migrated = true;
        } else {
          actionIds = [];
        }
      } catch (error) {
        console.warn("解析 Task actions 失败，将返回空数组", error);
        actionIds = [];
      }
      const createdAt =
        typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString();
      const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : createdAt;
      tasks.push({
        id: parsed.id,
        projectId,
        name: parsed.name,
        actionIds,
        createdAt,
        updatedAt
      });
      if (migrated) {
        await writeJSON(filePath, {
          id: parsed.id,
          name: parsed.name,
          actionIds,
          createdAt,
          updatedAt
        });
      }
    } catch (error) {
      console.error(`读取 Task 失败: ${filePath}`, error);
    }
  }

  tasks.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  setTasksCache(projectId, tasks);
  return tasks;
};

export const writeTask = async (
  projectId: string,
  payload: TaskPayload
): Promise<Task> => {
  if (!payload.name?.trim()) {
    throw new Error("Task 名称不能为空");
  }
  const tasksDir = await getTasksDir(projectId);
  await ensureDir(tasksDir);
  const now = new Date().toISOString();
  const taskId = payload.id ?? randomUUID();
  const targetFile = await getTaskFilePath(projectId, taskId);
  const existing = payload.id
    ? await readJSON<Record<string, unknown> | null>(targetFile, null).catch(() => null)
    : null;
  let createdAt = now;
  if (existing && typeof existing === "object") {
    const maybeCreated = (existing as Record<string, unknown>)["createdAt"];
    if (typeof maybeCreated === "string") {
      createdAt = maybeCreated;
    }
  }
  const rawActionIds = Array.isArray(payload.actionIds) ? payload.actionIds : [];
  const normalizedActionIds = Array.from(
    new Set(normalizeTaskActionIds(rawActionIds).filter((item) => item.length > 0))
  );
  const stored = {
    id: taskId,
    name: payload.name.trim(),
    actionIds: normalizedActionIds,
    createdAt,
    updatedAt: now
  };
  await writeJSON(targetFile, stored);
  clearTasksCache(projectId);
  return {
    id: taskId,
    projectId,
    name: stored.name,
    actionIds: normalizedActionIds,
    createdAt,
    updatedAt: now
  };
};

export const deleteTask = async (projectId: string, taskId: string) => {
  const filePath = await getTaskFilePath(projectId, taskId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  clearTasksCache(projectId);
};

export const deleteTasks = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deleteTask(projectId, id);
  }
  clearTasksCache(projectId);
};


