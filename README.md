# NateFlow

NateFlow 是一个基于 **Electron + React + Vite** 的桌面应用，用于管理项目模板与自动化 Action。应用通过自定义模板快速生成表单，支持在本地文件系统中持久化项目、模板与 Action 数据。

## 功能特性

- **模板管理**：创建、编辑、删除模板，定义占位符生成动态表单。
- **Action 管理**：搜索、分页、批量删除；支持从模板快速创建 Action。
- **动态表单**：根据模板中的占位符（如 `@number`、`@bool`、`@array<number>` 等）自动生成输入控件。
- **本地存储**：所有数据保存在 `data/` 目录下，可按项目隔离管理。

## 快速开始

1. 安装依赖：
   ```bash
   npm install
   ```
2. 开发模式启动（启动后会自动打开 Electron）：
   ```bash
   npm run dev
   ```
3. 构建生产包：
   ```bash
   npm run build
   ```
4. 预览打包后的应用：
   ```bash
   npm run preview
   ```
5. 生成安装包（Windows 示例）：
   ```bash
   npm run dist
   ```

## NPM 脚本

| 命令           | 说明                                   |
|----------------|----------------------------------------|
| `npm run dev`  | 并行启动 Vite 与 Electron，进行开发调试 |
| `npm run build`| 构建前端并编译 Electron 主进程         |
| `npm run preview` | 使用打包产物启动 Electron 进行预览 |
| `npm run pack` | 构建用于调试的目录结构（无安装程序）   |
| `npm run dist` | 构建可分发安装包                       |

## 目录结构

```
.
├── electron/          # Electron 主进程与预加载脚本
├── src/               # React 渲染进程源码
├── data/              # 本地数据目录（projects、templates、logs 等）
├── dist/              # 前端打包产物（自动生成）
├── dist-electron/     # 编译后的 Electron 主进程（自动生成）
└── release/           # electron-builder 输出的安装包
```

> ⚠️ 默认情况下 `.gitignore` 会忽略 `data/projects/` 与 `data/logs/`，以免提交个人项目数据或日志。若需要提供示例数据，可在版本库中保留必要的虚拟数据文件。

## 模板占位符约定

在模板 `content` 中使用以下占位符即可生成对应控件：

| 占位符示例              | 说明                                       |
|------------------------|--------------------------------------------|
| `"@string"`            | 普通文本输入框                             |
| `"@number"`            | 数值输入框                                 |
| `"@number|5"`          | 数值输入框，默认值 5                       |
| `"@bool|false"`        | 布尔开关，默认值 `false`                   |
| `"@array<number>|null"`| 以逗号分隔的数字数组，可留空表示 `null`    |
| `"常量值"`             | 生成只读字段，直接展示常量                 |

## 发布到 GitHub

1. 初始化 Git 仓库并提交代码：
   ```bash
   git init
   git add .
   git commit -m "chore: initialize NateFlow project"
   ```
2. 在 GitHub 创建新仓库，将远程地址添加到本地：
   ```bash
   git remote add origin https://github.com/natewangdev/nateflow.git
   git push -u origin main
   ```

## 许可证

本项目默认使用 ISC 许可证，可根据需要调整 `package.json` 中的 `license` 字段。
