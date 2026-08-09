import fs from "node:fs";
import path from "node:path";

export const OPENHANAKO_KNOWLEDGE_CHANGE =
  "2026-07-24-openhanako-knowledge-workspace";

export function resolveOpenHanakoKnowledgeArtifacts(
  repositoryRoot: string,
): string {
  const candidates = [
    path.join(
      repositoryRoot,
      "speculo/.speculo/specdev/changes",
      OPENHANAKO_KNOWLEDGE_CHANGE,
    ),
    path.join(
      repositoryRoot,
      "speculo/.speculo/specdev/archive/2026-07",
      OPENHANAKO_KNOWLEDGE_CHANGE,
    ),
  ];
  const matches = candidates.filter((candidate) => fs.existsSync(candidate));
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one active or archived OpenHanako knowledge artifact root; found ${matches.length}`,
    );
  }
  return matches[0]!;
}
