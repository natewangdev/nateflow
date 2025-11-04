const path = require("path");

require("ts-node").register({
  project: path.resolve(__dirname, "../tsconfig.electron.json"),
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs"
  }
});

require(path.resolve(__dirname, "preload.ts"));
