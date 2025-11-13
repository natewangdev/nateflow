import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type {
  ActionPayload,
  AppSettings,
  PlanPayload,
  TaskPayload,
  TemplatePayload,
  ThemeMode,
  ProjectPayload
} from "../src/shared/types";
import { appendLog } from "./services/logger";
import {
  resolveAssetPath,
  resolvePreload,
  resolveRendererTarget
} from "./services/runtimePaths";
import { loadSettings, persistSettings } from "./services/settings";
import { listProjects, writeProject, deleteProject } from "./services/projects";
import { listTemplates, writeTemplate, deleteTemplate } from "./services/templates";
import {
  listActions,
  writeAction,
  deleteAction as removeAction,
  deleteActions as removeActions
} from "./services/actions";
import {
  listTasks,
  writeTask,
  deleteTask as removeTask,
  deleteTasks as removeTasks
} from "./services/tasks";
import {
  listPlans,
  writePlan,
  deletePlan as removePlan,
  deletePlans as removePlans,
  buildPlanPreview
} from "./services/plans";
import { warmupCaches } from "./services/cacheWarmup";
import { isDev, setCachedAppRoot } from "./runtime";
import {
  actionCreateSchema,
  actionDeleteManySchema,
  actionDeleteSchema,
  actionUpdateSchema,
  planCreateSchema,
  planDeleteManySchema,
  planDeleteSchema,
  planUpdateSchema,
  projectCreateSchema,
  projectIdSchema,
  projectUpdateSchema,
  settingsUpdateSchema,
  taskCreateSchema,
  taskDeleteManySchema,
  taskDeleteSchema,
  taskUpdateSchema,
  templateIdSchema,
  templatePayloadSchema,
  templateUpdateSchema
} from "./validation/schemas";
import { parsePayload } from "./validation/utils";

const rendererConsoleIgnorePatterns: RegExp[] = [
  /Electron Security Warning/i,
  /The vm module of Node\.js is unsupported/i,
  /Download the React DevTools/i,
  /Request Autofill\./i
];

app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

const createMainWindow = async () => {
  await loadSettings();
  await appendLog("开始创建主窗口");

  const preloadPath = resolvePreload();
  const rendererTarget = resolveRendererTarget();
  const iconPath = resolveAssetPath("resources", "icons", "nateflow.png");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    title: "NateFlow",
    titleBarStyle: "hiddenInset",
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await appendLog(`预加载路径: ${preloadPath}`);
  await appendLog(`即将加载渲染目标: ${rendererTarget.type} -> ${rendererTarget.value}`);

  mainWindow.webContents.on(
    "console-message" as any,
    (event: any, ...legacyArgs: unknown[]) => {
      const payload =
        event && typeof event === "object" && "message" in event
          ? (event as {
              level: number;
              message: string;
              line: number;
              sourceId: string;
            })
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
    }
  );

  mainWindow.webContents.on("preload-error", (_event, preload, error) => {
    console.error(`预加载脚本加载失败: ${preload}`, error);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`页面加载失败(${errorCode}): ${errorDescription} -> ${validatedURL}`);
    }
  );

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
    console.error(
      `Renderer process terminated: ${details.reason} (code=${details.exitCode})`
    );
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.error("Renderer process became unresponsive");
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.setMenu(null);
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
  ipcMain.handle("settings:get", async () => loadSettings());

  ipcMain.handle("settings:update", async (_event, partial: Partial<AppSettings>) => {
    const payload = parsePayload(settingsUpdateSchema, partial);
    const nextTheme = (payload.theme ?? (await loadSettings()).theme) as ThemeMode;
    const merged = await persistSettings({
      ...payload,
      theme: nextTheme
    });
    await warmupCaches();
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

  ipcMain.handle("projects:list", async () => listProjects());

  ipcMain.handle("projects:create", async (_event, payload: ProjectPayload) => {
    const parsed = parsePayload(projectCreateSchema, payload);
    return writeProject(parsed);
  });

  ipcMain.handle(
    "projects:update",
    async (_event, payload: ProjectPayload & { id: string }) => {
      const parsed = parsePayload(projectUpdateSchema, payload);
      return writeProject(parsed);
    }
  );

  ipcMain.handle("projects:delete", async (_event, projectId: string) => {
    const parsed = parsePayload(projectIdSchema, projectId);
    await deleteProject(parsed);
  });

  ipcMain.handle("actions:list", async (_event, projectId: string) => {
    const parsed = parsePayload(projectIdSchema, projectId);
    return listActions(parsed);
  });

  ipcMain.handle(
    "actions:create",
    async (_event, payload: ActionPayload & { projectId: string }) => {
      const parsed = parsePayload(actionCreateSchema, payload);
      const { projectId, name, templateId, templateName, content } = parsed;
      return writeAction(projectId, {
        name,
        templateId,
        templateName: templateName ?? "",
        content
      });
    }
  );

  ipcMain.handle(
    "actions:update",
    async (_event, payload: ActionPayload & { id: string; projectId: string }) => {
      const parsed = parsePayload(actionUpdateSchema, payload);
      const { projectId, id, name, templateId, templateName, content } = parsed;
      return writeAction(projectId, {
        id,
        name,
        templateId,
        templateName: templateName ?? "",
        content
      });
    }
  );

  ipcMain.handle(
    "actions:delete",
    async (_event, payload: { projectId: string; id: string }) => {
      const parsed = parsePayload(actionDeleteSchema, payload);
      await removeAction(parsed.projectId, parsed.id);
    }
  );

  ipcMain.handle(
    "actions:deleteMany",
    async (_event, payload: { projectId: string; ids: string[] }) => {
      const parsed = parsePayload(actionDeleteManySchema, payload);
      await removeActions(parsed.projectId, parsed.ids);
    }
  );

  ipcMain.handle("tasks:list", async (_event, projectId: string) => {
    const parsed = parsePayload(projectIdSchema, projectId);
    return listTasks(parsed);
  });

  ipcMain.handle(
    "tasks:create",
    async (_event, payload: TaskPayload & { projectId: string }) => {
      const parsed = parsePayload(taskCreateSchema, payload);
      const { projectId, name, actionIds } = parsed;
      return writeTask(projectId, {
        name,
        actionIds: actionIds ?? []
      });
    }
  );

  ipcMain.handle(
    "tasks:update",
    async (_event, payload: TaskPayload & { id: string; projectId: string }) => {
      const parsed = parsePayload(taskUpdateSchema, payload);
      const { projectId, id, name, actionIds } = parsed;
      return writeTask(projectId, {
        id,
        name,
        actionIds: actionIds ?? []
      });
    }
  );

  ipcMain.handle(
    "tasks:delete",
    async (_event, payload: { projectId: string; id: string }) => {
      const parsed = parsePayload(taskDeleteSchema, payload);
      await removeTask(parsed.projectId, parsed.id);
    }
  );

  ipcMain.handle(
    "tasks:deleteMany",
    async (_event, payload: { projectId: string; ids: string[] }) => {
      const parsed = parsePayload(taskDeleteManySchema, payload);
      await removeTasks(parsed.projectId, parsed.ids);
    }
  );

  ipcMain.handle("plans:list", async (_event, projectId: string) => {
    const parsed = parsePayload(projectIdSchema, projectId);
    return listPlans(parsed);
  });

  ipcMain.handle(
    "plans:create",
    async (_event, payload: PlanPayload & { projectId: string }) => {
      const parsed = parsePayload(planCreateSchema, payload);
      const { projectId, name, tasks } = parsed;
      const normalizedTasks = tasks.map((item) => ({
        id: item.id,
        repeat: item.repeat ?? [1, 1]
      }));
      return writePlan(projectId, {
        name,
        tasks: normalizedTasks
      });
    }
  );

  ipcMain.handle(
    "plans:update",
    async (_event, payload: PlanPayload & { id: string; projectId: string }) => {
      const parsed = parsePayload(planUpdateSchema, payload);
      const { projectId, id, name, tasks } = parsed;
      const normalizedTasks = tasks.map((item) => ({
        id: item.id,
        repeat: item.repeat ?? [1, 1]
      }));
      return writePlan(projectId, {
        id,
        name,
        tasks: normalizedTasks
      });
    }
  );

  ipcMain.handle(
    "plans:delete",
    async (_event, payload: { projectId: string; id: string }) => {
      const parsed = parsePayload(planDeleteSchema, payload);
      await removePlan(parsed.projectId, parsed.id);
    }
  );

  ipcMain.handle(
    "plans:deleteMany",
    async (_event, payload: { projectId: string; ids: string[] }) => {
      const parsed = parsePayload(planDeleteManySchema, payload);
      await removePlans(parsed.projectId, parsed.ids);
    }
  );

  ipcMain.handle(
    "plans:preview",
    async (_event, payload: { projectId: string; id: string }) => {
      const parsed = parsePayload(planDeleteSchema, payload);
      return buildPlanPreview(parsed.projectId, parsed.id);
    }
  );

  ipcMain.handle("templates:list", async () => listTemplates());

  ipcMain.handle("templates:create", async (_event, payload: TemplatePayload) => {
    const parsed = parsePayload(templatePayloadSchema, payload);
    return writeTemplate({
      ...parsed,
      description: parsed.description ?? ""
    });
  });

  ipcMain.handle(
    "templates:update",
    async (_event, payload: TemplatePayload & { id: string }) => {
      const parsed = parsePayload(templateUpdateSchema, payload);
      const { id, ...rest } = parsed;
      return writeTemplate({
        id,
        ...rest,
        description: rest.description ?? ""
      });
    }
  );

  ipcMain.handle("templates:delete", async (_event, templateId: string) => {
    const parsed = parsePayload(templateIdSchema, templateId);
    await deleteTemplate(parsed);
  });
};

app.whenReady().then(async () => {
  setCachedAppRoot(app.getAppPath());
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

