import path from "path";
import { randomUUID } from "crypto";
import { existsSync, promises as fs } from "fs";
import { ensureDir, readJSON, writeJSON } from "../utils/fs";
import type { Project, ProjectPayload } from "../../src/shared/types";
import { getProjectPath, loadSettings } from "./settings";
import { clearActionsCache, clearPlansCache, clearTasksCache } from "../state/cache";

export const listProjects = async (): Promise<Project[]> => {
  const { projectRoot } = await loadSettings();
  await ensureDir(projectRoot);
  const dirents = await fs.readdir(projectRoot, { withFileTypes: true });
  const results: Project[] = [];

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const projectDir = path.join(projectRoot, dirent.name);
    const payload = await readJSON<Project | null>(
      path.join(projectDir, "project.json"),
      null
    );
    if (payload) {
      results.push(payload);
    }
  }

  results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return results;
};

export const writeProject = async (payload: ProjectPayload): Promise<Project> => {
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

export const deleteProject = async (projectId: string) => {
  const targetDir = await getProjectPath(projectId);
  if (!existsSync(targetDir)) {
    return;
  }
  await fs.rm(targetDir, { recursive: true, force: true });
  clearActionsCache(projectId);
  clearTasksCache(projectId);
  clearPlansCache(projectId);
};


