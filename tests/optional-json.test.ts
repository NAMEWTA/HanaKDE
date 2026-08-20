import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { readOptionalJSON } = require("../desktop/src/shared/optional-json.cjs");

describe("readOptionalJSON", () => {
  it("returns the fallback without logging when the optional file is absent", () => {
    const log = vi.fn();
    const readFile = vi.fn(() => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });

    expect(readOptionalJSON("preferences.json", {}, { readFile, log })).toEqual({});
    expect(log).not.toHaveBeenCalled();
  });

  it("logs non-ENOENT read and parse failures through the injected logger", () => {
    const ioLog = vi.fn();
    const parseLog = vi.fn();
    const denied = Object.assign(new Error("permission denied"), { code: "EACCES" });

    expect(readOptionalJSON("preferences.json", null, {
      readFile: () => { throw denied; },
      log: ioLog,
    })).toBeNull();
    expect(ioLog).toHaveBeenCalledWith(denied, "preferences.json");

    expect(readOptionalJSON("preferences.json", null, {
      readFile: () => "{invalid",
      log: parseLog,
    })).toBeNull();
    expect(parseLog).toHaveBeenCalledWith(expect.any(SyntaxError), "preferences.json");
  });

  it("returns parsed JSON on success", () => {
    expect(readOptionalJSON("preferences.json", {}, {
      readFile: () => '{"locale":"zh"}',
      log: vi.fn(),
    })).toEqual({ locale: "zh" });
  });
});
