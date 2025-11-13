import path from "path";
import { randomUUID } from "crypto";
import { existsSync, promises as fs } from "fs";
import type {
  Action,
  ActionContent,
  ActionPayload,
  Project
} from "../../src/shared/types";
import { ensureDir, readJSON, writeJSON } from "../utils/fs";
import { getProjectPath } from "./settings";
import {
  clearActionsCache,
  getActionsCache,
  setActionsCache
} from "../state/cache";
import { listProjects } from "./projects";

const parseActionContentJson = (json: string): ActionContent => {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Action 内容必须是一个 JSON 对象");
  }
  return parsed as ActionContent;
};

const decodeActionContentStrict = (encoded: string): ActionContent => {
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  return parseActionContentJson(decoded);
};

const decodeActionContentSafely = (raw: unknown): ActionContent => {
  if (typeof raw === "string") {
    try {
      return decodeActionContentStrict(raw);
    } catch (error) {
      console.warn("解析 Action 内容失败，返回空对象", error);
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as ActionContent;
  }
  return {};
};

const sanitizeActionContent = (raw: unknown): ActionContent => {
  if (typeof raw === "string") {
    return decodeActionContentStrict(raw);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Action 数据必须是一个 JSON 对象");
  }
  return raw as ActionContent;
};

const getActionsDir = async (projectId: string) =>
  path.join(await getProjectPath(projectId), "actions");

const getActionFilePath = async (projectId: string, actionId: string) =>
  path.join(await getActionsDir(projectId), `${actionId}.json`);

export const listActions = async (projectId: string): Promise<Action[]> => {
  const cached = getActionsCache(projectId);
  if (cached) {
    return cached;
  }

  const actionsDir = await getActionsDir(projectId);
  await ensureDir(actionsDir);
  const entries = await fs.readdir(actionsDir, { withFileTypes: true });
  const results: Action[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(actionsDir, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        id?: string;
        name?: string;
        content?: unknown;
        template_id?: string;
        templateId?: string;
        template_name?: string;
        templateName?: string;
        createdAt?: string;
        updatedAt?: string;
      };
      if (!parsed.id || !parsed.name) {
        continue;
      }
      const templateId = parsed.templateId ?? parsed.template_id ?? "";
      const templateName = parsed.templateName ?? parsed.template_name ?? "";
      if (!templateId) {
        continue;
      }
      const content = decodeActionContentSafely(parsed.content);
      const createdAt =
        typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString();
      const updatedAt =
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : createdAt;
      results.push({
        id: parsed.id,
        projectId,
        name: parsed.name,
        templateId,
        templateName,
        content,
        createdAt,
        updatedAt
      });
    } catch (error) {
      console.error(`读取 Action 失败: ${filePath}`, error);
    }
  }

  results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  setActionsCache(projectId, results);
  return results;
};

export const writeAction = async (
  projectId: string,
  payload: ActionPayload
): Promise<Action> => {
  const actionsDir = await getActionsDir(projectId);
  await ensureDir(actionsDir);
  const now = new Date().toISOString();
  const actionId = payload.id ?? randomUUID();
  const targetFile = await getActionFilePath(projectId, actionId);
  const existing = payload.id
    ? await readJSON<Record<string, unknown> | null>(targetFile, null).catch(() => null)
    : null;
  const normalizedContent = sanitizeActionContent(payload.content);
  let createdAt = now;
  if (existing && typeof existing === "object") {
    const maybeCreatedAt = (existing as Record<string, unknown>)["createdAt"];
    if (typeof maybeCreatedAt === "string") {
      createdAt = maybeCreatedAt;
    }
  }
  const stored = {
    id: actionId,
    name: payload.name.trim(),
    content: normalizedContent,
    template_id: payload.templateId,
    template_name: payload.templateName,
    createdAt,
    updatedAt: now
  };
  await writeJSON(targetFile, stored);
  clearActionsCache(projectId);
  return {
    id: actionId,
    projectId,
    name: stored.name,
    templateId: payload.templateId,
    templateName: payload.templateName,
    content: normalizedContent,
    createdAt,
    updatedAt: now
  };
};

export const deleteAction = async (projectId: string, actionId: string) => {
  const filePath = await getActionFilePath(projectId, actionId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  clearActionsCache(projectId);
};

export const deleteActions = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deleteAction(projectId, id);
  }
  clearActionsCache(projectId);
};

export const findActionsUsingTemplate = async (
  templateId: string
): Promise<Array<{ project: Project; action: Action }>> => {
  const projects = await listProjects();
  const usages: Array<{ project: Project; action: Action }> = [];

  for (const project of projects) {
    const actions = await listActions(project.id);
    for (const action of actions) {
      if (action.templateId === templateId) {
        usages.push({ project, action });
      }
    }
  }
  return usages;
};


