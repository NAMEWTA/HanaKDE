import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readWorkflow(name: string) {
  return fs.readFileSync(path.join(rootDir, ".github", "workflows", name), "utf-8");
}

describe("release mirror workflows", () => {
  it("does not automatically mirror an early unsigned installer release", () => {
    const workflow = readWorkflow("build.yml");

    expect(workflow).not.toContain("mirror-atomgit:");
    expect(workflow).not.toContain("ATOMGIT_TOKEN");
    expect(workflow).not.toContain("node scripts/mirror-release-to-atomgit.mjs");
  });

  it("keeps manual selection explicit and routes GitHub release edits by exact tag", () => {
    const workflow = readWorkflow("mirror-release-to-atomgit.yml");

    expect(workflow).toContain("- newest");
    expect(workflow).toContain("- stable");
    expect(workflow).toContain("- tag");
    expect(workflow).toContain("ATOMGIT_REPO: ${{ vars.ATOMGIT_REPO }}");
    expect(workflow).toContain("ATOMGIT_OWNER: ${{ vars.ATOMGIT_OWNER }}");
    expect(workflow).toContain("steps.mirror_config.outputs.enabled == 'true'");
    expect(workflow).toContain("INPUT_LIMIT: ${{ inputs.limit }}");
    expect(workflow).toContain('ARGS+=(--stable "$INPUT_LIMIT")');
    expect(workflow).toContain('ARGS+=(--newest "$INPUT_LIMIT")');
    expect(workflow).toContain("RELEASE_TAG: ${{ github.event.release.tag_name }}");
    expect(workflow).toContain('ARGS+=(--tag "$RELEASE_TAG")');
  });
});
