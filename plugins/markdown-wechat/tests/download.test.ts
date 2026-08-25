import { describe, expect, it } from "vitest";
import { createDownloadArtifact, downloadArtifact } from "../src/download/index.ts";

describe("browser downloads", () => {
  it("uses safe names, correct MIME types, and revokes object URLs", () => {
    const artifact = createDownloadArtifact("markdown", "bad/name?", "# Body");
    expect(artifact).toMatchObject({ filename: "bad-name-.md", mime: "text/markdown;charset=utf-8" });
    let clicked = false;
    let revoked = "";
    const anchor = { href: "", download: "", rel: "", style: { display: "" }, click() { clicked = true; }, remove() {} };
    const result = downloadArtifact(artifact, {
      document: { body: { appendChild() {} }, createElement: () => anchor } as unknown as Document,
      URL: { createObjectURL: () => "blob:test", revokeObjectURL: (url: string) => { revoked = url; } } as unknown as typeof URL,
      Blob,
    });
    expect(result.ok).toBe(true);
    expect(clicked).toBe(true);
    expect(revoked).toBe("blob:test");
  });

  it("reports unavailable browser APIs", () => {
    const result = downloadArtifact(createDownloadArtifact("html", "Article", "<p>x</p>"), { document: undefined, URL: {} as typeof URL });
    expect(result.ok).toBe(false);
    expect(result.filename).toBe("Article.html");
  });
});
