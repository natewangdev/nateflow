const path = require("path");
const { spawn } = require("child_process");
const waitOn = require("wait-on");

const rendererUrl = "http://localhost:5173";
const electronBinary = require("electron");

const run = async () => {
  try {
    await waitOn({
      resources: [rendererUrl],
      timeout: 30000,
      log: true
    });
  } catch (error) {
    console.error("等待渲染进程启动失败：", error);
    process.exit(1);
    return;
  }

  const env = {
    ...process.env,
    ELECTRON_ENV: "development"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronBinary, ["."], {
    stdio: "inherit",
    env
  });

  child.on("exit", (code, signal) => {
    console.log(`[start-electron] Electron exited with code=${code ?? "null"} signal=${signal ?? "null"}`);
    process.exit(code ?? 0);
  });
};

run();
