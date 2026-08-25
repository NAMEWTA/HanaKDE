import { describe, expect, it } from "vitest";
import { copyMarkdownText, copyRichText } from "../src/clipboard/index.ts";

describe("clipboard delivery", () => {
  it("writes both rich HTML and plain text with ClipboardItem", async () => {
    let payload: Record<string, Blob> | undefined;
    class Item { constructor(value: Record<string, Blob>) { payload = value; } }
    const result = await copyRichText("<p data-line=\"1\">Hi</p>", "Hi", {
      navigator: { clipboard: { write: async () => undefined } } as unknown as Navigator,
      ClipboardItem: Item as unknown as typeof ClipboardItem,
      Blob,
    });
    expect(result).toEqual({ ok: true, method: "clipboard-item" });
    expect(Object.keys(payload ?? {}).sort()).toEqual(["text/html", "text/plain"]);
    expect(await payload?.["text/html"]?.text()).toBe("<p>Hi</p>");
  });

  it("uses selection fallback and reports browser rejection", async () => {
    let removed = false;
    const host = { contentEditable: "", style: { cssText: "" }, innerHTML: "", setAttribute() {}, remove() { removed = true; } };
    const document = {
      body: { appendChild() {} }, createElement: () => host,
      createRange: () => ({ selectNodeContents() {} }), execCommand: () => false,
    } as unknown as Document;
    const window = { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) } as unknown as Window;
    const result = await copyRichText("<b>Hi</b>", "Hi", { navigator: {} as Navigator, document, window });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rejected/);
    expect(removed).toBe(true);
  });

  it("uses the host plain-text capability and surfaces denial", async () => {
    expect(await copyMarkdownText("# Source", async ({ text }) => text)).toMatchObject({ ok: true, method: "write-text" });
    expect((await copyMarkdownText("# Source", async () => { throw new Error("denied"); })).error).toBe("denied");
  });
});
