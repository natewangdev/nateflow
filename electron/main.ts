import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { pathToFileURL } from "url";
import fs from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import type {
  AppSettings,
  Action,
  ActionContent,
  ActionPayload,
  Project,
  ProjectPayload,
  Template,
  TemplateContent,
  TemplatePayload,
  Task,
  TaskPayload,
  Plan,
  PlanPayload,
  PlanPreview,
  PlanTaskRef,
  ThemeMode
} from "../src/shared/types";

const isDev = process.env.ELECTRON_ENV === "development";
const runtimeRoot = process.cwd();
let appRootCache: string | null = null;
let dataRootCache: string | null = null;
let logFileCache: string | null = null;
const templatesDirName = "templates";

let mainWindow: BrowserWindow | null = null;
let settingsCache: AppSettings | null = null;

let templateCache: Template[] | null = null;
const actionCache = new Map<string, Action[]>();
const taskCache = new Map<string, Task[]>();
const planCache = new Map<string, Plan[]>();

const warmupCaches = async () => {
  templateCache = null;
  actionCache.clear();
  taskCache.clear();
  planCache.clear();
  await listTemplates();
  const projects = await listProjects();
  for (const project of projects) {
    await listActions(project.id);
    await listTasks(project.id);
    await listPlans(project.id);
  }
};

const rendererConsoleIgnorePatterns: RegExp[] = [
  /Electron Security Warning/i,
  /The vm module of Node\.js is unsupported/i,
  /Download the React DevTools/i,
  /Request Autofill\./i
];

// Disable GPU acceleration to avoid driver-related crashes observed on some Windows setups.
app.disableHardwareAcceleration();

const ensureDir = async (dir: string) => {
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
};

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

const resolveDataRoot = () => {
  if (dataRootCache) {
    return dataRootCache;
  }
  if (isDev) {
    dataRootCache = path.join(runtimeRoot, "data");
    return dataRootCache;
  }
  if (!app.isReady()) {
    throw new Error("Application is not ready yet, cannot resolve data directory");
  }
  const appDataPath = app.getPath("appData");
  dataRootCache = path.join(appDataPath, "NateFlow");
  return dataRootCache;
};

const getSettingsFilePath = () => {
  return path.join(resolveDataRoot(), "settings.json");
};

const getDefaultProjectRoot = () => {
  return path.join(resolveDataRoot(), "projects");
};

const getTemplatesDir = async () => {
  const { projectRoot } = await loadSettings();
  return path.join(projectRoot, templatesDirName);
};

const appendLog = async (message: string) => {
  try {
    const dataRoot = resolveDataRoot();
    await ensureDir(dataRoot);
    const logDir = path.join(dataRoot, "logs");
    await ensureDir(logDir);
    if (!logFileCache) {
      logFileCache = path.join(logDir, "main.log");
    }
    await fs.appendFile(logFileCache, `[${new Date().toISOString()}] ${message}\n`, "utf-8");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("写入日志失败", error);
  }
};

const readJSON = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const buffer = await fs.readFile(filePath, "utf-8");
    return JSON.parse(buffer) as T;
  } catch (error) {
    return fallback;
  }
};

const writeJSON = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
};

const loadSettings = async (): Promise<AppSettings> => {
  if (settingsCache) {
    return settingsCache;
  }
  const dataRoot = resolveDataRoot();
  await ensureDir(dataRoot);
  const defaultSettings: AppSettings = {
    theme: "light",
    projectRoot: getDefaultProjectRoot()
  };
  const fileSettings = await readJSON<AppSettings>(getSettingsFilePath(), defaultSettings);
  settingsCache = {
    ...defaultSettings,
    ...fileSettings
  };
  await ensureDir(settingsCache.projectRoot);
  await ensureDir(path.join(settingsCache.projectRoot, templatesDirName));
  return settingsCache;
};

const persistSettings = async (next: Partial<AppSettings>) => {
  const current = await loadSettings();
  settingsCache = {
    ...current,
    ...next
  };
  await ensureDir(settingsCache.projectRoot);
  const templatesDir = await getTemplatesDir();
  await ensureDir(templatesDir);
  await writeJSON(getSettingsFilePath(), settingsCache);
  await warmupCaches();
  return settingsCache;
};

const getProjectPath = async (projectId: string) => {
  const { projectRoot } = await loadSettings();
  return path.join(projectRoot, projectId);
};

const listProjects = async (): Promise<Project[]> => {
  const { projectRoot } = await loadSettings();
  await ensureDir(projectRoot);
  const dirents = await fs.readdir(projectRoot, { withFileTypes: true });
  const results: Project[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const projectDir = path.join(projectRoot, dirent.name);
    const payload = await readJSON<Project | null>(path.join(projectDir, "project.json"), null);
    if (payload) {
      results.push(payload);
    }
  }
  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return results;
};

const writeProject = async (payload: ProjectPayload): Promise<Project> => {
  const now = new Date().toISOString();
  const projectId = payload.id ?? randomUUID();
  const targetDir = await getProjectPath(projectId);
  const existing = payload.id
    ? await readJSON<Project | null>(path.join(targetDir, "project.json"), null)
    : null;
  const projectData: Project = {
    id: projectId,
    name: payload.name.trim(),
    imageBase64: payload.imageBase64,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await ensureDir(targetDir);
  await writeJSON(path.join(targetDir, "project.json"), projectData);
  return projectData;
};

const deleteProject = async (projectId: string) => {
  const targetDir = await getProjectPath(projectId);
  if (!existsSync(targetDir)) {
    return;
  }
  await fs.rm(targetDir, { recursive: true, force: true });
  actionCache.delete(projectId);
  taskCache.delete(projectId);
  planCache.delete(projectId);
};

const getTemplateFilePath = async (templateId: string) => {
  const templatesDir = await getTemplatesDir();
  return path.join(templatesDir, `${templateId}.json`);
};

const isPlainObject = (value: unknown): value is TemplateContent => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

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

const listTemplates = async (): Promise<Template[]> => {
  if (templateCache) {
    return templateCache;
  }
  const templatesDir = await getTemplatesDir();
  await ensureDir(templatesDir);
  const entries = await fs.readdir(templatesDir, { withFileTypes: true });
  console.log(`[listTemplates] entries=${entries.length}`);
  const templates: Template[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    const filePath = path.join(templatesDir, entry.name);
    try {
      console.log(`[listTemplates] reading ${filePath}`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
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
      const templateRecord: Template = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description ?? '',
        content,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        updatedAt: parsed.updatedAt ?? new Date().toISOString()
      };
      templates.push(templateRecord);
      console.log(`[listTemplates] added ${templateRecord.id}`);
      if (migrated) {
        console.log(`[listTemplates] migrating ${parsed.id}`);
        await writeJSON(filePath, {
          ...parsed,
          content,
          createdAt: templateRecord.createdAt,
          updatedAt: templateRecord.updatedAt
        });
      }
    } catch (error) {
      console.error('读取模板失败: ' + filePath, error);
    }
  }
  templates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  templateCache = templates;
  return templates;
};

const writeTemplate = async (payload: TemplatePayload): Promise<Template> => {
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
    description: payload.description?.trim() ?? existing?.description ?? '',
    content: normalizedContent,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await writeJSON(targetFile, stored);
  templateCache = null;
  return {
    ...stored,
    content: normalizedContent
  };
};

const findActionsUsingTemplate = async (templateId: string) => {
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

const deleteTemplate = async (templateId: string) => {
  const relatedActions = await findActionsUsingTemplate(templateId);
  if (relatedActions.length > 0) {
    const summary = relatedActions
      .map(({ project, action }) => `- 项目「${project.name}」中的 Action「${action.name}」`)
      .join('\n');
    throw new Error(`无法删除该模板，以下 Action 正在使用它：\n${summary}`);
  }
  const templatesDir = await getTemplatesDir();
  const filePath = path.join(templatesDir, `${templateId}.json`);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  templateCache = null;
};

const getActionsDir = async (projectId: string) => {
  return path.join(await getProjectPath(projectId), "actions");
};

const getActionFilePath = async (projectId: string, actionId: string) => {
  return path.join(await getActionsDir(projectId), `${actionId}.json`);
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

const listActions = async (projectId: string): Promise<Action[]> => {
  const cached = actionCache.get(projectId);
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
      console.error("读取 Action 失败: " + filePath, error);
    }
  }
  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  actionCache.set(projectId, results);
  return results;
};

const writeAction = async (projectId: string, payload: ActionPayload): Promise<Action> => {
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
  actionCache.delete(projectId);
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

const deleteAction = async (projectId: string, actionId: string) => {
  const filePath = await getActionFilePath(projectId, actionId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  actionCache.delete(projectId);
};

const deleteActions = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deleteAction(projectId, id);
  }
  actionCache.delete(projectId);
};

const getTasksDir = async (projectId: string) => {
  return path.join(await getProjectPath(projectId), "tasks");
};

const getTaskFilePath = async (projectId: string, taskId: string) => {
  return path.join(await getTasksDir(projectId), `${taskId}.json`);
};

const getPlansDir = async (projectId: string) => {
  return path.join(await getProjectPath(projectId), "plans");
};

const getPlanFilePath = async (projectId: string, planId: string) => {
  return path.join(await getPlansDir(projectId), `${planId}.json`);
};

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

const sanitizePlanTasks = (raw: unknown): PlanTaskRef[] => {
  if (!Array.isArray(raw)) {
    throw new Error("Plan tasks 必须是数组");
  }
  const refs = raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Plan tasks[${index}] 不是有效对象`);
    }
    const candidate = item as Partial<PlanTaskRef>;
    if (!candidate.id || typeof candidate.id !== "string" || !candidate.id.trim()) {
      throw new Error(`Plan tasks[${index}] 缺少有效的 Task 标识`);
    }
    const repeatRaw = (candidate.repeat as unknown) ?? [1, 1];
    if (
      !Array.isArray(repeatRaw) ||
      repeatRaw.length !== 2 ||
      repeatRaw.some((value) => typeof value !== "number" || Number.isNaN(value))
    ) {
      throw new Error(`Plan tasks[${index}] repeat 配置无效`);
    }
    const [minRaw, maxRaw] = repeatRaw;
    const min = Math.max(0, Math.floor(minRaw));
    const max = Math.max(0, Math.floor(maxRaw));
    if (min === 0 && max === 0) {
      return {
        id: candidate.id.trim(),
        repeat: [0, 0] as [number, number]
      };
    }
    const normalizedMin = Math.max(1, min);
    const normalizedMax = Math.max(normalizedMin, max);
    return {
      id: candidate.id.trim(),
      repeat: [normalizedMin, normalizedMax] as [number, number]
    };
  });

  if (refs.length === 0) {
    throw new Error("Plan 至少需要一个 Task");
  }

  refs.forEach((ref, index) => {
    if (ref.repeat[0] === 0 && ref.repeat[1] === 0) {
      const isLast = index === refs.length - 1;
      const isSingle = refs.length === 1;
      if (!isLast && !isSingle) {
        throw new Error("只有最后一个 Task 或唯一的 Task 可以设置无限循环");
      }
    }
  });

  return refs;
};

const listTasks = async (projectId: string): Promise<Task[]> => {
  const cached = taskCache.get(projectId);
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
      console.error("读取 Task 失败: " + filePath, error);
    }
  }
  tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  taskCache.set(projectId, tasks);
  return tasks;
};

const listPlans = async (projectId: string): Promise<Plan[]> => {
  const cached = planCache.get(projectId);
  if (cached) {
    return cached;
  }
  const plansDir = await getPlansDir(projectId);
  await ensureDir(plansDir);
  const entries = await fs.readdir(plansDir, { withFileTypes: true });
  const plans: Plan[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(plansDir, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        id?: string;
        name?: string;
        tasks?: unknown;
        createdAt?: string;
        updatedAt?: string;
      };
      if (!parsed.id || !parsed.name) {
        continue;
      }
      let tasks: PlanTaskRef[] = [];
      try {
        tasks = sanitizePlanTasks(parsed.tasks ?? []);
      } catch (error) {
        console.warn("解析 Plan tasks 失败，将返回空数组", error);
        tasks = [];
      }
      const createdAt =
        typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString();
      const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : createdAt;
      plans.push({
        id: parsed.id,
        projectId,
        name: parsed.name,
        tasks,
        createdAt,
        updatedAt
      });
    } catch (error) {
      console.error("读取 Plan 失败: " + filePath, error);
    }
  }
  plans.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  planCache.set(projectId, plans);
  return plans;
};

const writePlan = async (projectId: string, payload: PlanPayload): Promise<Plan> => {
  if (!payload.name?.trim()) {
    throw new Error("Plan 名称不能为空");
  }
  const plansDir = await getPlansDir(projectId);
  await ensureDir(plansDir);
  const now = new Date().toISOString();
  const planId = payload.id ?? randomUUID();
  const targetFile = await getPlanFilePath(projectId, planId);
  const existing = payload.id
    ? await readJSON<Record<string, unknown> | null>(targetFile, null).catch(() => null)
    : null;
  let createdAt = now;
  if (existing && typeof existing === "object") {
    const maybeCreated = existing["createdAt"];
    if (typeof maybeCreated === "string") {
      createdAt = maybeCreated;
    }
  }
  const sanitizedTasks = sanitizePlanTasks(payload.tasks);
  const stored = {
    id: planId,
    name: payload.name.trim(),
    tasks: sanitizedTasks,
    createdAt,
    updatedAt: now
  };
  await writeJSON(targetFile, stored);
  planCache.delete(projectId);
  return {
    id: planId,
    projectId,
    name: stored.name,
    tasks: sanitizedTasks,
    createdAt,
    updatedAt: now
  };
};

const deletePlan = async (projectId: string, planId: string) => {
  const filePath = await getPlanFilePath(projectId, planId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  planCache.delete(projectId);
};

const deletePlans = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deletePlan(projectId, id);
  }
  planCache.delete(projectId);
};

const buildPlanPreview = async (projectId: string, planId: string): Promise<PlanPreview> => {
  const plans = await listPlans(projectId);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    throw new Error("未找到指定的 Plan");
  }
  const tasks = await listTasks(projectId);
  const taskMap = new Map(tasks.map((item) => [item.id, item]));
  const actions = await listActions(projectId);
  const actionMap = new Map(actions.map((item) => [item.id, item]));
  const previewTasks = plan.tasks.map((taskRef) => {
    const task = taskMap.get(taskRef.id);
    const previewActions =
      task?.actionIds.map((actionId) => {
        const action = actionMap.get(actionId);
        if (!action) {
          return {
            id: actionId,
            name: `未知动作 (${actionId})`,
            templateId: "",
            templateName: "",
            content: {}
          };
        }
        return {
          id: action.id,
          name: action.name,
          templateId: action.templateId,
          templateName: action.templateName,
          content: action.content
        };
      }) ?? [];
    return {
      id: taskRef.id,
      name: task?.name ?? `未知任务 (${taskRef.id})`,
      repeat: taskRef.repeat,
      actions: previewActions
    };
  });
  return {
    id: plan.id,
    projectId: plan.projectId,
    name: plan.name,
    tasks: previewTasks,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
};

const writeTask = async (projectId: string, payload: TaskPayload): Promise<Task> => {
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
    const maybeCreated = existing["createdAt"];
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
  taskCache.delete(projectId);
  return {
    id: taskId,
    projectId,
    name: stored.name,
    actionIds: normalizedActionIds,
    createdAt,
    updatedAt: now
  };
};

const deleteTask = async (projectId: string, taskId: string) => {
  const filePath = await getTaskFilePath(projectId, taskId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  taskCache.delete(projectId);
};

const deleteTasks = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deleteTask(projectId, id);
  }
  taskCache.delete(projectId);
};

const resolveFromRoots = (...segments: string[]) => {
  const runtimeCandidate = path.join(runtimeRoot, ...segments);
  if (existsSync(runtimeCandidate)) {
    return runtimeCandidate;
  }
  const appRoot = appRootCache ?? app.getAppPath();
  appRootCache = appRoot;
  return path.join(appRoot, ...segments);
};

const resolvePreload = () => {
  if (isDev) {
    return resolveFromRoots("electron", "preload.dev.js");
  }
  return resolveFromRoots("dist-electron", "electron", "preload.js");
};

const resolveRendererTarget = () => {
  if (isDev) {
    return { type: "url" as const, value: "http://localhost:5173" };
  }
  const distEntry = resolveFromRoots("dist", "index.html");
  return { type: "file" as const, value: distEntry };
};

const createMainWindow = async () => {
  await loadSettings();
  await appendLog("开始创建主窗口");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const preloadPath = resolvePreload();
  const rendererTarget = resolveRendererTarget();
  await appendLog(`预加载路径: ${preloadPath}`);
  await appendLog(`即将加载渲染目标: ${rendererTarget.type} -> ${rendererTarget.value}`);

  mainWindow.webContents.on("console-message" as any, (event: any, ...legacyArgs: unknown[]) => {
    const payload =
      event && typeof event === "object" && "message" in event
        ? (event as { level: number; message: string; line: number; sourceId: string })
        : {
            level: legacyArgs[0] as number,
            message: (legacyArgs[1] as string) ?? "",
            line: (legacyArgs[2] as number) ?? 0,
            sourceId: (legacyArgs[3] as string) ?? ""
          };
    const { level, message, line, sourceId } = payload;
    if (level < 2) {
      return;
    }
    if (rendererConsoleIgnorePatterns.some((pattern) => pattern.test(message))) {
      return;
    }
    console.error(`[renderer][${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`预加载脚本加载失败: ${preloadPath}`, error);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`页面加载失败(${errorCode}): ${errorDescription} -> ${validatedURL}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("渲染进程加载完成");
    if (isDev) {
      mainWindow?.webContents
        .executeJavaScript("typeof window.api !== 'undefined'")
        .then((result) => {
          console.log("window.api 是否存在:", result);
        })
        .catch((error) => {
          console.error("检查 window.api 失败", error);
        });
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Renderer process terminated: ${details.reason} (code=${details.exitCode})`);
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.error("Renderer process became unresponsive");
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.maximize();
    mainWindow.show();
  });

  if (rendererTarget.type === "url") {
    await mainWindow.loadURL(rendererTarget.value);
  } else {
    await mainWindow.loadFile(rendererTarget.value);
  }
  await appendLog("渲染进程加载指令已发送");

  if (isDev && process.env.NATEFLOW_DEVTOOLS === "1") {
    const devtoolsMode = process.env.NATEFLOW_DEVTOOLS_MODE ?? "undocked";
    try {
      mainWindow.webContents.openDevTools({ mode: devtoolsMode as any });
    } catch (error) {
      console.warn(`Failed to open DevTools in mode=${devtoolsMode}`, error);
    }
  }
};

const registerIpcHandlers = () => {
  ipcMain.handle("settings:get", async () => {
    return loadSettings();
  });

  ipcMain.handle("settings:update", async (_event, partial: Partial<AppSettings>) => {
    const nextTheme = (partial.theme ?? (await loadSettings()).theme) as ThemeMode;
    if (partial.theme && !["light", "dark"].includes(partial.theme)) {
      throw new Error("不支持的主题模式");
    }
    const merged = await persistSettings({
      ...partial,
      theme: nextTheme
    });
    return merged;
  });

  ipcMain.handle("dialog:pickDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("projects:list", async () => {
    return listProjects();
  });

  ipcMain.handle("projects:create", async (_event, payload: ProjectPayload) => {
    if (!payload.name?.trim()) {
      throw new Error("项目名称为必填项");
    }
    return writeProject(payload);
  });

  ipcMain.handle("projects:update", async (_event, payload: ProjectPayload & { id: string }) => {
    if (!payload.id) {
      throw new Error("缺少项目标识");
    }
    if (!payload.name?.trim()) {
      throw new Error("项目名称为必填项");
    }
    return writeProject(payload);
  });

  ipcMain.handle("projects:delete", async (_event, projectId: string) => {
    if (!projectId) {
      throw new Error("缺少项目标识");
    }
    await deleteProject(projectId);
  });



  ipcMain.handle("actions:list", async (_event, projectId: string) => {
    if (!projectId) {
      throw new Error("??????");
    }
    return listActions(projectId);
  });

  ipcMain.handle("actions:create", async (_event, payload: ActionPayload & { projectId: string }) => {
    if (!payload.projectId) {
      throw new Error("??????");
    }
    if (!payload.name?.trim()) {
      throw new Error("Action ??????");
    }
    if (!payload.templateId) {
      throw new Error("??????");
    }
    const { projectId, ...rest } = payload;
    return writeAction(projectId, rest);
  });

  ipcMain.handle(
    "actions:update",
    async (_event, payload: ActionPayload & { id: string; projectId: string }) => {
      if (!payload.projectId) {
        throw new Error("??????");
      }
      if (!payload.id) {
        throw new Error("?? Action ??");
      }
      if (!payload.name?.trim()) {
        throw new Error("Action ??????");
      }
      if (!payload.templateId) {
        throw new Error("??????");
      }
      const { projectId, ...rest } = payload;
      return writeAction(projectId, rest);
    }
  );

  ipcMain.handle(
    "actions:delete",
    async (_event, payload: { projectId: string; id: string }) => {
      if (!payload?.projectId) {
        throw new Error("??????");
      }
      if (!payload.id) {
        throw new Error("?? Action ??");
      }
      await deleteAction(payload.projectId, payload.id);
    }
  );

  ipcMain.handle(
    "actions:deleteMany",
    async (_event, payload: { projectId: string; ids: string[] }) => {
      if (!payload?.projectId) {
        throw new Error("??????");
      }
      if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
        return;
      }
      await deleteActions(payload.projectId, payload.ids.filter(Boolean));
    }
  );
  ipcMain.handle("tasks:list", async (_event, projectId: string) => {
    if (!projectId) {
      throw new Error("缺少项目标识");
    }
    return listTasks(projectId);
  });

  ipcMain.handle("tasks:create", async (_event, payload: TaskPayload & { projectId: string }) => {
    if (!payload.projectId) {
      throw new Error("缺少项目标识");
    }
    if (!payload.name?.trim()) {
      throw new Error("Task 名称不能为空");
    }
    return writeTask(payload.projectId, payload);
  });

  ipcMain.handle("tasks:update", async (_event, payload: TaskPayload & { id: string; projectId: string }) => {
    if (!payload.projectId) {
      throw new Error("缺少项目标识");
    }
    if (!payload.id) {
      throw new Error("缺少 Task 标识");
    }
    if (!payload.name?.trim()) {
      throw new Error("Task 名称不能为空");
    }
    return writeTask(payload.projectId, payload);
  });

  ipcMain.handle(
    "tasks:delete",
    async (_event, payload: { projectId: string; id: string }) => {
      if (!payload?.projectId) {
        throw new Error("缺少项目标识");
      }
      if (!payload.id) {
        throw new Error("缺少 Task 标识");
      }
      await deleteTask(payload.projectId, payload.id);
    }
  );

  ipcMain.handle(
    "tasks:deleteMany",
    async (_event, payload: { projectId: string; ids: string[] }) => {
      if (!payload?.projectId) {
        throw new Error("缺少项目标识");
      }
      if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
        return;
      }
      await deleteTasks(payload.projectId, payload.ids.filter(Boolean));
    }
  );
  ipcMain.handle("plans:list", async (_event, projectId: string) => {
    if (!projectId) {
      throw new Error("缺少项目标识");
    }
    return listPlans(projectId);
  });

  ipcMain.handle(
    "plans:create",
    async (_event, payload: PlanPayload & { projectId: string }) => {
      if (!payload.projectId) {
        throw new Error("缺少项目标识");
      }
      return writePlan(payload.projectId, payload);
    }
  );

  ipcMain.handle(
    "plans:update",
    async (_event, payload: PlanPayload & { id: string; projectId: string }) => {
      if (!payload.projectId) {
        throw new Error("缺少项目标识");
      }
      if (!payload.id) {
        throw new Error("缺少 Plan 标识");
      }
      return writePlan(payload.projectId, payload);
    }
  );

  ipcMain.handle(
    "plans:delete",
    async (_event, payload: { projectId: string; id: string }) => {
      if (!payload.projectId) {
        throw new Error("缺少项目标识");
      }
      if (!payload.id) {
        throw new Error("缺少 Plan 标识");
      }
      await deletePlan(payload.projectId, payload.id);
    }
  );

  ipcMain.handle(
    "plans:deleteMany",
    async (_event, payload: { projectId: string; ids: string[] }) => {
      if (!payload.projectId) {
        throw new Error("缺少项目标识");
      }
      if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
        return;
      }
      await deletePlans(payload.projectId, payload.ids.filter(Boolean));
    }
  );

  ipcMain.handle(
    "plans:preview",
    async (_event, payload: { projectId: string; id: string }) => {
      if (!payload.projectId) {
        throw new Error("缺少项目标识");
      }
      if (!payload.id) {
        throw new Error("缺少 Plan 标识");
      }
      return buildPlanPreview(payload.projectId, payload.id);
    }
  );
  ipcMain.handle("templates:list", async () => {
    console.log("[templates:list] start");
    const result = await listTemplates();
    console.log("[templates:list] done, count=", result.length);
    return result;
  });

  ipcMain.handle("templates:create", async (_event, payload: TemplatePayload) => {
    if (!payload.name?.trim()) {
      throw new Error("模板名称为必填项");
    }
    return writeTemplate(payload);
  });

  ipcMain.handle("templates:update", async (_event, payload: TemplatePayload & { id: string }) => {
    if (!payload.id) {
      throw new Error("缺少模板标识");
    }
    if (!payload.name?.trim()) {
      throw new Error("模板名称为必填项");
    }
    return writeTemplate(payload);
  });

  ipcMain.handle("templates:delete", async (_event, templateId: string) => {
    if (!templateId) {
      throw new Error("缺少模板标识");
    }
    await deleteTemplate(templateId);
  });
};

app.whenReady().then(async () => {
  appRootCache = app.getAppPath();
  await loadSettings();
  await warmupCaches();
  registerIpcHandlers();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});


































