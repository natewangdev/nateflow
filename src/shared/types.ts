export type ThemeMode = "light" | "dark";

export interface Project {
  id: string;
  name: string;
  imageBase64?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPayload {
  id?: string;
  name: string;
  imageBase64?: string;
}

export interface AppSettings {
  theme: ThemeMode;
  projectRoot: string;
}

export type TemplateContent = Record<string, unknown>;

export interface Template {
  id: string;
  name: string;
  description: string;
  content: TemplateContent;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePayload {
  id?: string;
  name: string;
  description: string;
  content: TemplateContent;
}

export type ActionContent = Record<string, unknown>;

export interface Action {
  id: string;
  projectId: string;
  name: string;
  templateId: string;
  templateName: string;
  content: ActionContent;
  createdAt: string;
  updatedAt: string;
}

export interface ActionPayload {
  id?: string;
  name: string;
  templateId: string;
  templateName: string;
  content: ActionContent;
}

export interface TaskActionNode {
  id: string;
  name: string;
  content: ActionContent;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  actions: TaskActionNode[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskPayload {
  id?: string;
  name: string;
  actions: TaskActionNode[];
}
