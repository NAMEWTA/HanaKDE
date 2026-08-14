import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoApplication } from "../src/service.ts";
import { TodoStore } from "../src/store.ts";

describe("todolist T-03 capture and organization seam", () => {
  it("captures one visible item and rejects multiline or batch-like input", () => {
    const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-capture-"))), undefined, () => "capture-1");
    expect(app.capture("one item").todo.title).toBe("one item");
    expect(() => app.capture("line one\nline two")).toThrowError(expect.objectContaining({ code: "validation" }));
  });

  it("trashes a Project without deleting Todos and projects the active Todo to Inbox", () => {
    const app = new TodoApplication(new TodoStore(fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-project-"))), undefined, () => "project-1");
    const project = app.createProject("Launch").project;
    const todo = app.create({ title: "Keep history", projectId: project.id }).todo;
    const trashed = app.removeProject(project.id, project.version).project;
    expect(app.query({ view: "inbox" }).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: todo.id, projectId: project.id })]));
    expect(app.queryProjects(true)).toEqual(expect.arrayContaining([expect.objectContaining({ id: project.id, deletedAt: trashed.deletedAt })]));
    expect(app.get(todo.id).todo.projectId).toBe(project.id);
  });
});
