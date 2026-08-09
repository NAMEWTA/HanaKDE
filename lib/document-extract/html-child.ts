import { htmlToMarkdownDocument } from "../tools/web-reader.ts";

function reply(message: unknown): void {
  if (typeof process.send !== "function") {
    process.exit(1);
    return;
  }
  process.send(message, () => process.exit(0));
}

type HtmlConversionRequest = {
  kind: "html";
  bytes: Buffer;
  maxOutputBytes: number;
};

function parseRequest(message: unknown): HtmlConversionRequest {
  if (!message || typeof message !== "object") {
    throw new Error("invalid HTML conversion request");
  }
  const request = message as Record<string, unknown>;
  if (request.kind !== "html" || !Buffer.isBuffer(request.bytes)) {
    throw new Error("invalid HTML conversion request");
  }
  const maxOutputBytes = request.maxOutputBytes;
  if (
    typeof maxOutputBytes !== "number"
    || !Number.isSafeInteger(maxOutputBytes)
    || maxOutputBytes < 1
  ) {
    throw new Error("invalid HTML conversion output limit");
  }
  return {
    kind: "html",
    bytes: request.bytes,
    maxOutputBytes,
  };
}

process.on("message", async (message: unknown) => {
  try {
    const request = parseRequest(message);
    process.send?.({ type: "started" });
    const document = await htmlToMarkdownDocument(
      request.bytes.toString("utf8"),
      "https://document.invalid/",
    );
    if (typeof document?.content !== "string") throw new Error("invalid HTML conversion result");
    if (Buffer.byteLength(document.content, "utf8") > request.maxOutputBytes) {
      throw new Error("HTML conversion output exceeds its limit");
    }
    reply({ type: "result", ok: true, markdown: document.content });
  } catch {
    reply({ type: "result", ok: false, failureCode: "parse-failed" });
  }
});
