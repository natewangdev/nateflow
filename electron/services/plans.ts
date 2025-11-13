import path from "path";
import { randomUUID } from "crypto";
import { existsSync, promises as fs } from "fs";
import type {
  Action,
  Plan,
  PlanPayload,
  PlanPreview,
  PlanTaskRef,
  Task
} from "../../src/shared/types";
import { ensureDir, readJSON, writeJSON } from "../utils/fs";
import { getProjectPath } from "./settings";
import {
  clearPlansCache,
  getPlansCache,
  setPlansCache
} from "../state/cache";
import { listTasks } from "./tasks";
import { listActions } from "./actions";

const getPlansDir = async (projectId: string) =>
  path.join(await getProjectPath(projectId), "plans");

const getPlanFilePath = async (projectId: string, planId: string) =>
  path.join(await getPlansDir(projectId), `${planId}.json`);

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

export const listPlans = async (projectId: string): Promise<Plan[]> => {
  const cached = getPlansCache(projectId);
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
      console.error(`读取 Plan 失败: ${filePath}`, error);
    }
  }

  plans.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  setPlansCache(projectId, plans);
  return plans;
};

export const writePlan = async (
  projectId: string,
  payload: PlanPayload
): Promise<Plan> => {
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
    const maybeCreated = (existing as Record<string, unknown>)["createdAt"];
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
  clearPlansCache(projectId);
  return {
    id: planId,
    projectId,
    name: stored.name,
    tasks: sanitizedTasks,
    createdAt,
    updatedAt: now
  };
};

export const deletePlan = async (projectId: string, planId: string) => {
  const filePath = await getPlanFilePath(projectId, planId);
  if (!existsSync(filePath)) {
    return;
  }
  await fs.rm(filePath, { force: true });
  clearPlansCache(projectId);
};

export const deletePlans = async (projectId: string, ids: string[]) => {
  for (const id of ids) {
    await deletePlan(projectId, id);
  }
  clearPlansCache(projectId);
};

export const buildPlanPreview = async (
  projectId: string,
  planId: string
): Promise<PlanPreview> => {
  const plans = await listPlans(projectId);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    throw new Error("未找到指定的 Plan");
  }
  const tasks = await listTasks(projectId);
  const taskMap = new Map<string, Task>(tasks.map((item) => [item.id, item]));
  const actions = await listActions(projectId);
  const actionMap = new Map<string, Action>(actions.map((item) => [item.id, item]));
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


