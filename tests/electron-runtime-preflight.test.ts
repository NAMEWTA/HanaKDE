import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  electronArchiveExtractionCommand,
  inspectElectronRuntime,
} from "../scripts/ensure-electron-runtime.mjs";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

function makePackageDirectory() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "hanakde-electron-runtime-"));
  fixtures.push(fixture);
  return fixture;
}

describe("Electron runtime preflight", () => {
  it("uses argument-safe platform extractors for Electron's signed archive", () => {
    expect(electronArchiveExtractionCommand("darwin", "/tmp/electron.zip", "/tmp/dist")).toEqual({
      command: "/usr/bin/ditto",
      args: ["-x", "-k", "/tmp/electron.zip", "/tmp/dist"],
    });
    expect(electronArchiveExtractionCommand("win32", "C:\\electron.zip", "C:\\dist")).toEqual({
      command: "tar.exe",
      args: ["-xf", "C:\\electron.zip", "-C", "C:\\dist"],
    });
    expect(electronArchiveExtractionCommand("linux", "/tmp/electron.zip", "/tmp/dist")).toEqual({
      command: "unzip",
      args: ["-q", "/tmp/electron.zip", "-d", "/tmp/dist"],
    });
  });

  it("rejects an installation without path.txt", () => {
    const packageDirectory = makePackageDirectory();
    expect(inspectElectronRuntime(packageDirectory)).toMatchObject({
      ready: false,
      reason: expect.stringContaining("path.txt"),
    });
  });

  it("rejects a partial extraction without dist/version", () => {
    const packageDirectory = makePackageDirectory();
    fs.mkdirSync(path.join(packageDirectory, "dist"), { recursive: true });
    fs.writeFileSync(path.join(packageDirectory, "path.txt"), "electron", "utf8");
    fs.writeFileSync(path.join(packageDirectory, "dist", "electron"), "fixture", "utf8");

    expect(inspectElectronRuntime(packageDirectory)).toMatchObject({
      ready: false,
      reason: expect.stringContaining("dist/version"),
    });
  });

  it("accepts a complete runtime", () => {
    const packageDirectory = makePackageDirectory();
    fs.mkdirSync(path.join(packageDirectory, "dist"), { recursive: true });
    fs.writeFileSync(path.join(packageDirectory, "path.txt"), "electron", "utf8");
    fs.writeFileSync(path.join(packageDirectory, "dist", "electron"), "fixture", "utf8");
    fs.writeFileSync(path.join(packageDirectory, "dist", "version"), "42.3.0", "utf8");

    expect(inspectElectronRuntime(packageDirectory)).toEqual({
      ready: true,
      executable: path.join(packageDirectory, "dist", "electron"),
    });
  });
});
