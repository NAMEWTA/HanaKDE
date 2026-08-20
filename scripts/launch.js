#!/usr/bin/env node
/**
 * Cross-platform dev launcher
 * 解决 POSIX `VAR=val cmd` 语法和 `~` 在 Windows 上不工作的问题
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { applyDevEnvironment } from "./dev-env.js";
import { verifyRootRuntimeDependencies } from "./verify-runtime-dependencies.mjs";

const require = createRequire(import.meta.url);
applyDevEnvironment(process.env);

const mode = process.argv[2];
const extra = process.argv.slice(3);

try {
  await verifyRootRuntimeDependencies();
} catch (error) {
  console.error(`[launcher] ${error.message}`);
  process.exit(1);
}

let bin, args;
switch (mode) {
  case "electron":
    bin = require("electron");
    args = [".", ...extra];
    break;
  case "electron-dev":
    bin = require("electron");
    args = [".", "--dev", ...extra];
    break;
  case "electron-vite":
    process.env.VITE_DEV_URL = "http://localhost:5173";
    bin = require("electron");
    args = [".", "--dev", ...extra];
    break;
  case "cli":
    bin = process.execPath;
    args = ["cli/entry.ts", ...extra];
    break;
  case "server":
    bin = process.execPath;
    args = ["server/main-full.ts", ...extra];
    break;
  default:
    console.error("Usage: node scripts/launch.js <electron|electron-dev|electron-vite|cli|server>");
    process.exit(1);
}

// Electron 以子进程运行时（如 VS Code / Claude Code 终端），
// 父进程可能设了 ELECTRON_RUN_AS_NODE=1，会让 Electron 以纯 Node 模式启动，
// 导致 require('electron') 拿不到内置 API。spawn 前清掉。
delete process.env.ELECTRON_RUN_AS_NODE;

const child = spawn(bin, args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
