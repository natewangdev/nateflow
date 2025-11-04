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

const getTemplatesDir = () => {
  return path.join(resolveDataRoot(), templatesDirName);
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
  await ensureDir(getTemplatesDir());
  return settingsCache;
};

const persistSettings = async (next: Partial<AppSettings>) => {
  const current = await loadSettings();
  settingsCache = {
    ...current,
    ...next
  };
  await ensureDir(settingsCache.projectRoot);
  await ensureDir(getTemplatesDir());
  await writeJSON(getSettingsFilePath(), settingsCache);
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
};

const getTemplateFilePath = (templateId: string) => {
  return path.join(getTemplatesDir(), `${templateId}.json`);
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
  await ensureDir(getTemplatesDir());
  const entries = await fs.readdir(getTemplatesDir(), { withFileTypes: true });
  console.log(`[listTemplates] entries=${entries.length}`);
  const templates: Template[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(getTemplatesDir(), entry.name);
    try {
      console.log(`[listTemplates] reading ${filePath}`);
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
      const templateRecord: Template = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description ?? "",
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
      console.error("读取模板失败: " + filePath, error);
    }
  }
  templates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return templates;
};

const writeTemplate = async (payload: TemplatePayload): Promise<Template> => {
  await ensureDir(getTemplatesDir());
  const now = new Date().toISOString();
  const templateId = payload.id ?? randomUUID();
  const targetFile = getTemplateFilePath(templateId);
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
  return {
    ...stored,
    content: normalizedContent
  };
};

const deleteTemplate = async (templateId: string) => {
  const filePath = getTemplateFilePath(templateId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
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
};

const deleteActions = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deleteAction(projectId, id);
  }
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


































