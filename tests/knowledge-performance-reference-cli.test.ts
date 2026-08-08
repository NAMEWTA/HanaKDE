import { describe, expect, it } from "vitest";
import { resolveAuditedCommit } from "../scripts/run-knowledge-performance-reference.ts";

describe("knowledge reference performance CLI", () => {
  const head = "0123456789abcdef0123456789abcdef01234567";

  it("uses the clean worktree HEAD when no commit is supplied", () => {
    expect(resolveAuditedCommit(null, head)).toBe(head);
  });

  it("normalizes an exact or abbreviated HEAD to the full commit", () => {
    expect(resolveAuditedCommit(head, head)).toBe(head);
    expect(resolveAuditedCommit(head.slice(0, 12), head)).toBe(head);
  });

  it("rejects evidence labels that do not identify HEAD", () => {
    expect(() => resolveAuditedCommit("fedcba987654", head))
      .toThrow("--commit must identify the clean worktree HEAD");
  });
});
