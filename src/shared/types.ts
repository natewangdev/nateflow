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
  content: TemplateContent | string;
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
  content: ActionContent | string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  actionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskPayload {
  id?: string;
  name: string;
  actionIds: string[];
}

export type PlanRepeat = [number, number];

export interface PlanTaskRef {
  id: string;
  repeat: PlanRepeat;
}

export interface Plan {
  id: string;
  projectId: string;
  name: string;
  tasks: PlanTaskRef[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanPayload {
  id?: string;
  name: string;
  tasks: PlanTaskRef[];
}

export interface PlanPreviewAction {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  content: ActionContent;
}

export interface PlanPreviewTask {
  id: string;
  name: string;
  repeat: PlanRepeat;
  actions: PlanPreviewAction[];
}

export interface PlanPreview {
  id: string;
  projectId: string;
  name: string;
  tasks: PlanPreviewTask[];
  createdAt: string;
  updatedAt: string;
}
