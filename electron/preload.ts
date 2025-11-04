import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  Action,
  ActionPayload,
  Project,
  ProjectPayload,
  Template,
  TemplatePayload
} from "../src/shared/types";

contextBridge.exposeInMainWorld("api", {
  getProjects: (): Promise<Project[]> => ipcRenderer.invoke("projects:list"),
  createProject: (payload: ProjectPayload): Promise<Project> =>
    ipcRenderer.invoke("projects:create", payload),
  updateProject: (id: string, payload: ProjectPayload): Promise<Project> =>
    ipcRenderer.invoke("projects:update", { ...payload, id }),
  deleteProject: (id: string): Promise<void> =>
    ipcRenderer.invoke("projects:delete", id),
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", settings),
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pickDirectory"),
  getTemplates: (): Promise<Template[]> =>
    ipcRenderer.invoke("templates:list"),
  createTemplate: (payload: TemplatePayload): Promise<Template> =>
    ipcRenderer.invoke("templates:create", payload),
  updateTemplate: (id: string, payload: TemplatePayload): Promise<Template> =>
    ipcRenderer.invoke("templates:update", { ...payload, id }),
  deleteTemplate: (id: string): Promise<void> =>
    ipcRenderer.invoke("templates:delete", id),
  getActions: (projectId: string): Promise<Action[]> =>
    ipcRenderer.invoke("actions:list", projectId),
  createAction: (projectId: string, payload: ActionPayload): Promise<Action> =>
    ipcRenderer.invoke("actions:create", { projectId, ...payload }),
  updateAction: (
    projectId: string,
    id: string,
    payload: ActionPayload
  ): Promise<Action> => ipcRenderer.invoke("actions:update", { projectId, id, ...payload }),
  deleteAction: (projectId: string, id: string): Promise<void> =>
    ipcRenderer.invoke("actions:delete", { projectId, id }),
  deleteActions: (projectId: string, ids: string[]): Promise<void> =>
    ipcRenderer.invoke("actions:deleteMany", { projectId, ids })
});

console.log("预加载已准备完成，window.api 可用");
