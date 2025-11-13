import path from "path";
import { existsSync } from "fs";
import { app } from "electron";
import { isDev, runtimeRoot, getCachedAppRoot, setCachedAppRoot } from "../runtime";

type RendererTarget =
  | { type: "url"; value: string }
  | { type: "file"; value: string };

const resolveFromRoots = (...segments: string[]) => {
  const runtimeCandidate = path.join(runtimeRoot, ...segments);
  if (existsSync(runtimeCandidate)) {
    return runtimeCandidate;
  }
  const appRoot = getCachedAppRoot() ?? app.getAppPath();
  setCachedAppRoot(appRoot);
  return path.join(appRoot, ...segments);
};

export const resolvePreload = () => {
  if (isDev) {
    return resolveFromRoots("electron", "preload.dev.js");
  }
  return resolveFromRoots("dist-electron", "electron", "preload.js");
};

export const resolveRendererTarget = (): RendererTarget => {
  if (isDev) {
    return { type: "url", value: "http://localhost:5173" };
  }
  const distEntry = resolveFromRoots("dist", "index.html");
  return { type: "file", value: distEntry };
};

export const resolveAssetPath = (...segments: string[]) => resolveFromRoots(...segments);

