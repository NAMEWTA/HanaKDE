import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const THREAT_MODEL_PATH = path.resolve(
  "speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/threat-model.md",
);

type ThreatRow = {
  id: string;
  boundary: string;
  attacker: string;
  precondition: string;
  threat: string;
  control: string;
  evidence: string;
  owners: string;
  residualRisk: string;
};

function threatRows(): ThreatRow[] {
  const markdown = fs.readFileSync(THREAT_MODEL_PATH, "utf8");
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\| TM-\d{3} \|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      expect(cells).toHaveLength(9);
      return {
        id: cells[0]!,
        boundary: cells[1]!,
        attacker: cells[2]!,
        precondition: cells[3]!,
        threat: cells[4]!,
        control: cells[5]!,
        evidence: cells[6]!,
        owners: cells[7]!,
        residualRisk: cells[8]!,
      };
    });
}

describe("knowledge threat-control matrix", () => {
  it("freezes exactly TM-001 through TM-020 with no empty control or evidence", () => {
    const rows = threatRows();
    expect(rows.map((row) => row.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `TM-${String(index + 1).padStart(3, "0")}`,
      ),
    );
    for (const row of rows) {
      expect(row.boundary).not.toBe("");
      expect(row.attacker).not.toBe("");
      expect(row.precondition).not.toBe("");
      expect(row.threat).not.toBe("");
      expect(row.control).not.toBe("");
      expect(row.evidence).not.toBe("");
      expect(row.owners).toMatch(/^\d{2}(?:,\d{2})*$/);
      expect(row.residualRisk).not.toBe("");
    }
  });

  it("assigns Ticket 14 to every baseline malicious-workspace boundary", () => {
    const byId = new Map(threatRows().map((row) => [row.id, row]));
    for (const id of [
      "TM-001",
      "TM-002",
      "TM-003",
      "TM-004",
      "TM-005",
      "TM-006",
      "TM-007",
      "TM-008",
      "TM-009",
      "TM-010",
      "TM-013",
      "TM-014",
      "TM-016",
      "TM-018",
      "TM-019",
      "TM-020",
    ]) {
      expect(byId.get(id)?.owners.split(",")).toContain("14");
    }
  });

  it("keeps the fixed principal, native credential, transfer and pre-read controls explicit", () => {
    const rows = threatRows();
    const matrix = rows
      .map((row) => [
        row.id,
        row.threat,
        row.control,
        row.evidence,
      ].join(" "))
      .join("\n");

    expect(matrix).toMatch(/principal\/user\/studio|principal only from authenticated/i);
    expect(matrix).toMatch(/普通 server token|Main-only credential/i);
    expect(matrix).toMatch(/wrong credential\/replay\/wrong action\/expired grant/i);
    expect(matrix).toMatch(/1MiB chunk\/4 streams\/8MiB buffer/i);
    expect(matrix).toMatch(/partial directory|半目录/i);
    expect(matrix).toMatch(/read 前 stat/i);
    expect(matrix).toMatch(/symlink\/junction/i);
    expect(matrix).toMatch(/HTML\/SVG\/URI/i);
    expect(matrix).toMatch(/control chars|控制字符/i);
    expect(matrix).toMatch(/Unicode/i);
    expect(matrix).toMatch(/UNC/i);
    expect(matrix).toMatch(/TOCTOU/i);
  });
});
