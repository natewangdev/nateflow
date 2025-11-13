import { clearAllCaches } from "../state/cache";
import { listTemplates } from "./templates";
import { listProjects } from "./projects";
import { listActions } from "./actions";
import { listTasks } from "./tasks";
import { listPlans } from "./plans";

export const warmupCaches = async () => {
  clearAllCaches();
  await listTemplates();
  const projects = await listProjects();
  for (const project of projects) {
    await listActions(project.id);
    await listTasks(project.id);
    await listPlans(project.id);
  }
};


