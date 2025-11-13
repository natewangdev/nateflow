import { app } from "electron";
import path from "path";
import { ensureDir, readJSON, writeJSON } from "../utils/fs";
import type { AppSettings, ThemeMode } from "../../src/shared/types";
import { isDev, runtimeRoot } from "../runtime";

const templatesDirName = "templates";

let dataRootCache: string | null = null;
let settingsCache: AppSettings | null = null;

export const getTemplatesDirName = () => templatesDirName;

export const resolveDataRoot = () => {
  if (dataRootCache) {
    return dataRootCache;
  }
  if (isDev) {
    dataRootCache = path.join(runtimeRoot, "data");
    return dataRootCache;
  }
  if (!app.isReady()) {
    throw new Error("应用尚未准备就绪，无法解析数据目录");
  }
  const appDataPath = app.getPath("appData");
  dataRootCache = path.join(appDataPath, "NateFlow");
  return dataRootCache;
};

export const getSettingsFilePath = () => path.join(resolveDataRoot(), "settings.json");

export const getDefaultProjectRoot = () => path.join(resolveDataRoot(), "projects");

export const clearSettingsCache = () => {
  settingsCache = null;
};

export const loadSettings = async (): Promise<AppSettings> => {
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

export const persistSettings = async (partial: Partial<AppSettings>) => {
  const current = await loadSettings();
  const nextTheme = (partial.theme ?? current.theme) as ThemeMode;
  const merged: AppSettings = {
    ...current,
    ...partial,
    theme: nextTheme
  };
  settingsCache = merged;
  await ensureDir(merged.projectRoot);
  await ensureDir(path.join(merged.projectRoot, templatesDirName));
  await writeJSON(getSettingsFilePath(), merged);
  return merged;
};

export const getProjectPath = async (projectId: string) => {
  const { projectRoot } = await loadSettings();
  return path.join(projectRoot, projectId);
};

export const getTemplatesDir = async () => {
  const { projectRoot } = await loadSettings();
  return path.join(projectRoot, templatesDirName);
};


