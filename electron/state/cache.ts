import type { Action, Plan, Task, Template } from "../../src/shared/types";

let templateCache: Template[] | null = null;
const actionCache = new Map<string, Action[]>();
const taskCache = new Map<string, Task[]>();
const planCache = new Map<string, Plan[]>();

export const getTemplateCache = () => templateCache;
export const setTemplateCache = (value: Template[] | null) => {
  templateCache = value;
};

export const getActionsCache = (projectId: string) => actionCache.get(projectId) ?? null;
export const setActionsCache = (projectId: string, value: Action[]) => {
  actionCache.set(projectId, value);
};
export const clearActionsCache = (projectId?: string) => {
  if (projectId) {
    actionCache.delete(projectId);
    return;
  }
  actionCache.clear();
};

export const getTasksCache = (projectId: string) => taskCache.get(projectId) ?? null;
export const setTasksCache = (projectId: string, value: Task[]) => {
  taskCache.set(projectId, value);
};
export const clearTasksCache = (projectId?: string) => {
  if (projectId) {
    taskCache.delete(projectId);
    return;
  }
  taskCache.clear();
};

export const getPlansCache = (projectId: string) => planCache.get(projectId) ?? null;
export const setPlansCache = (projectId: string, value: Plan[]) => {
  planCache.set(projectId, value);
};
export const clearPlansCache = (projectId?: string) => {
  if (projectId) {
    planCache.delete(projectId);
    return;
  }
  planCache.clear();
};

export const clearAllCaches = () => {
  setTemplateCache(null);
  clearActionsCache();
  clearTasksCache();
  clearPlansCache();
};

