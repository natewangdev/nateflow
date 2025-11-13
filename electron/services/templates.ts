import path from "path";
import { randomUUID } from "crypto";
import { existsSync, promises as fs } from "fs";
import type {
  Template,
  TemplateContent,
  TemplatePayload
} from "../../src/shared/types";
import { ensureDir, readJSON, writeJSON } from "../utils/fs";
import { getTemplatesDir } from "./settings";
import {
  getTemplateCache,
  setTemplateCache
} from "../state/cache";
import { findActionsUsingTemplate } from "./actions";

const isPlainObject = (value: unknown): value is TemplateContent =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeLegacyTemplateContent = (encoded: string): TemplateContent | null => {
  try {
    const decodedText = Buffer.from(encoded, "base64").toString("utf-8");
    const parsed = JSON.parse(decodedText);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn("回退解析旧版模板内容失败（base64）", error);
  }
  try {
    const parsed = JSON.parse(encoded);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn("回退解析旧版模板内容失败（直接 JSON）", error);
  }
  return null;
};

const sanitizeTemplateContent = (raw: unknown): TemplateContent => {
  if (!isPlainObject(raw)) {
    throw new Error("模板内容必须是一个 JSON 对象");
  }
  return raw;
};

const resolveTemplateContent = (
  raw: unknown
): { content: TemplateContent; migrated: boolean } => {
  if (isPlainObject(raw)) {
    return { content: raw, migrated: false };
  }
  if (typeof raw === "string" && raw.trim()) {
    const legacy = decodeLegacyTemplateContent(raw.trim());
    if (legacy) {
      return { content: legacy, migrated: true };
    }
  }
  throw new Error("模板内容缺失或格式不正确");
};

export const listTemplates = async (): Promise<Template[]> => {
  const cached = getTemplateCache();
  if (cached) {
    return cached;
  }

  const templatesDir = await getTemplatesDir();
  await ensureDir(templatesDir);
  const entries = await fs.readdir(templatesDir, { withFileTypes: true });
  const templates: Template[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(templatesDir, entry.name);
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(fileContent) as {
        id?: string;
        name?: string;
        description?: string;
        content?: unknown;
        createdAt?: string;
        updatedAt?: string;
      };
      if (!parsed.id || !parsed.name) {
        continue;
      }
      const { content, migrated } = resolveTemplateContent(parsed.content);
      const createdAt = parsed.createdAt ?? new Date().toISOString();
      const updatedAt = parsed.updatedAt ?? new Date().toISOString();
      const templateRecord: Template = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description ?? "",
        content,
        createdAt,
        updatedAt
      };
      templates.push(templateRecord);
      if (migrated) {
        await writeJSON(filePath, {
          ...parsed,
          content,
          createdAt,
          updatedAt
        });
      }
    } catch (error) {
      console.error(`读取模板失败: ${filePath}`, error);
    }
  }

  templates.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  setTemplateCache(templates);
  return templates;
};

export const writeTemplate = async (payload: TemplatePayload): Promise<Template> => {
  const templatesDir = await getTemplatesDir();
  await ensureDir(templatesDir);
  const now = new Date().toISOString();
  const templateId = payload.id ?? randomUUID();
  const targetFile = path.join(templatesDir, `${templateId}.json`);
  const existing = payload.id
    ? await readJSON<Template | null>(targetFile, null).catch(() => null)
    : null;
  const normalizedContent = sanitizeTemplateContent(payload.content);
  const stored = {
    id: templateId,
    name: payload.name.trim(),
    description: payload.description?.trim() ?? existing?.description ?? "",
    content: normalizedContent,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await writeJSON(targetFile, stored);
  setTemplateCache(null);
  return {
    ...stored,
    content: normalizedContent
  };
};

export const deleteTemplate = async (templateId: string) => {
  const relatedActions = await findActionsUsingTemplate(templateId);
  if (relatedActions.length > 0) {
    const summary = relatedActions
      .map(
        ({ project, action }) =>
          `- 项目「${project.name}」中的 Action「${action.name}」`
      )
      .join("\n");
    throw new Error(`无法删除该模板，以下 Action 正在使用它：\n${summary}`);
  }
  const templatesDir = await getTemplatesDir();
  const filePath = path.join(templatesDir, `${templateId}.json`);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  setTemplateCache(null);
};


