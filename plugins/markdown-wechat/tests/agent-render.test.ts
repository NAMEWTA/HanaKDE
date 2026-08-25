import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { execute, name, parameters } from "../tools/render.ts";
import { mockContext, removeDirectory, temporaryDirectory } from "./helpers.ts";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) removeDirectory(dir); });

describe("Agent render tool", () => {
  it("exposes a named tool and returns inline HTML without a session", async () => {
    const dir = temporaryDirectory(); directories.push(dir);
    const result = await execute({ markdown: "# Agent", theme: "signal" }, mockContext(dir));
    expect(name).toBe("render");
    expect(parameters.additionalProperties).toBe(false);
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("no session file") })]));
    expect((result.details as any).markdownWechat.sessionFile).toBe("unavailable_without_session");
    expect(fs.existsSync(`${dir}/generated`)).toBe(false);
  });

  it("reads ResourceRef and stages only plugin-private HTML as SessionFile", async () => {
    const dir = temporaryDirectory(); directories.push(dir);
    let stagedPath = "";
    const context = mockContext(dir, {
      sessionId: "session-1",
      stageFile(input) {
        stagedPath = String(input.filePath);
        return { mediaItem: { type: "session_file", fileId: "file-1", sessionId: "session-1", filePath: stagedPath, label: input.label } };
      },
    });
    const result = await execute({ resourceRef: { kind: "local", name: "article.md" }, title: "Agent result" }, context);
    expect(stagedPath.startsWith(`${dir}/generated/`)).toBe(true);
    expect(fs.readFileSync(stagedPath, "utf8")).toContain("<!doctype html>");
    expect((result.details as any).markdownWechat.sessionFile).toBe("created");
    expect(result.details).toHaveProperty("media");
  });

  it("rejects ambiguous input and cleans failed staging output", async () => {
    const dir = temporaryDirectory(); directories.push(dir);
    const ambiguous = await execute({ markdown: "x", resourceRef: { kind: "local" } }, mockContext(dir));
    expect((ambiguous.details as any).error.code).toBe("invalid_input");
    const failed = await execute({ markdown: "# x" }, mockContext(dir, {
      sessionId: "session-1",
      stageFile() { throw new Error("registry unavailable"); },
    }));
    expect((failed.details as any).error.code).toBe("stage_failed");
    expect(fs.readdirSync(`${dir}/generated`)).toHaveLength(0);
  });
});
