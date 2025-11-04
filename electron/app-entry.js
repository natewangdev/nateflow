const path = require("path");

if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const currentEnv = process.env.ELECTRON_ENV;
const isDev = currentEnv === "development";
const appRoot = path.resolve(__dirname, "..");

if (isDev) {
  console.log(`[app-entry] ELECTRON_ENV=${currentEnv ?? "undefined"}`);
  if (!process.cwd().startsWith(appRoot)) {
    process.chdir(appRoot);
  }

  require("ts-node").register({
    project: path.resolve(appRoot, "tsconfig.electron.json"),
    transpileOnly: true,
    compilerOptions: {
      module: "commonjs"
    }
  });

  require(path.resolve(appRoot, "electron/main.ts"));
} else {
  const compiledMain = path.resolve(appRoot, "dist-electron", "electron", "main.js");
  try {
    require(compiledMain);
  } catch (error) {
    console.error("[app-entry] 无法加载编译后的主进程：", compiledMain, error);
    throw error;
  }
}
