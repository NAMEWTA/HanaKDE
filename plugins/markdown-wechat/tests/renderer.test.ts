import { describe, expect, it } from "vitest";
import { createWechatDocument, renderMarkdown, stripPreviewMeta } from "../src/renderer/index.ts";

describe("WeChat renderer", () => {
  it("renders core Markdown with inline presentation and stable source", () => {
    const source = "# Heading\n\n> Quote\n\n- item\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nalert(1)\n```";
    const rendered = renderMarkdown(source, { theme: "jade", font: "serif", fontSize: 18 });
    expect(rendered.html).toContain("<h1");
    expect(rendered.html).toContain("<blockquote");
    expect(rendered.html).toContain("<table");
    expect(rendered.html).toContain("data-language=\"js\"");
    expect(rendered.settings).toEqual({ theme: "jade", font: "serif", fontSize: 18 });
    expect(source).toContain("# Heading");
  });

  it("escapes dangerous markup and replaces remote media", () => {
    const rendered = renderMarkdown("<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[external](https://example.invalid/page)\n\n![remote](https://example.invalid/a.png)\n\n@[video:clip](https://example.invalid/v.mp4)");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("href=\"javascript:");
    expect(rendered.html).not.toContain("example.invalid");
    expect(rendered.html).not.toContain("<a ");
    expect(rendered.html).toContain("External link disabled");
    expect(rendered.html).toContain("Image unavailable");
    expect(rendered.html).toContain("Video placeholder");
    expect(rendered.diagnostics).toEqual(["external_link_disabled", "media_placeholder", "video_placeholder"]);
  });

  it("strips preview metadata from clipboard and exported documents", () => {
    const html = renderMarkdown("# Export").html;
    expect(html).toContain("data-line=");
    expect(stripPreviewMeta(html)).not.toContain("data-line=");
    expect(createWechatDocument("# Export", {}, "<Title>")).toContain("&lt;Title&gt;");
  });

  it("does not treat origin-relative host paths as safe media", () => {
    const rendered = renderMarkdown("![host api](/api/resources/private.png)");
    expect(rendered.html).not.toContain("src=\"/api/");
    expect(rendered.html).toContain("Image unavailable");
  });
});
