import type {
  AppSettings,
  Action,
  ActionPayload,
  Project,
  ProjectPayload,
  Template,
  TemplatePayload
} from "./src/shared/types";

declare global {
  interface Window {
    api: {
      getProjects(): Promise<Project[]>;
      createProject(payload: ProjectPayload): Promise<Project>;
      updateProject(id: string, payload: ProjectPayload): Promise<Project>;
      deleteProject(id: string): Promise<void>;
      getSettings(): Promise<AppSettings>;
      updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
      pickDirectory(): Promise<string | null>;
      getTemplates(): Promise<Template[]>;
      createTemplate(payload: TemplatePayload): Promise<Template>;
      updateTemplate(id: string, payload: TemplatePayload): Promise<Template>;
      deleteTemplate(id: string): Promise<void>;
      getActions(projectId: string): Promise<Action[]>;
      createAction(projectId: string, payload: ActionPayload): Promise<Action>;
      updateAction(
        projectId: string,
        id: string,
        payload: ActionPayload
      ): Promise<Action>;
      deleteAction(projectId: string, id: string): Promise<void>;
      deleteActions(projectId: string, ids: string[]): Promise<void>;
    };
  }
}

export {};
