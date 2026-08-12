"use strict";

const SCANNED_PDF_MESSAGE = /scan(?:ned)?|image[- ]only|no text(?: layer)?|ocr/i;

function reply(message) {
  if (typeof process.send !== "function") {
    process.exit(1);
    return;
  }
  process.send(message, () => process.exit(0));
}

function failureCode(error) {
  const message = typeof error?.message === "string" ? error.message : String(error);
  return SCANNED_PDF_MESSAGE.test(message) ? "scanned-pdf" : "parse-failed";
}

function outputLimit(request) {
  if (!Number.isSafeInteger(request?.maxOutputBytes) || request.maxOutputBytes < 1) {
    throw new Error("invalid conversion output limit");
  }
  return request.maxOutputBytes;
}

process.on("message", async (request) => {
  try {
    if (!request || typeof request.modulePath !== "string" || !request.modulePath) {
      throw new Error("missing Anydoc module");
    }
    const anydoc = require(request.modulePath);
    process.send?.({ type: "started" });
    let markdown;
    if (request.kind === "bytes") {
      if (!Buffer.isBuffer(request.bytes) || typeof request.format !== "string") {
        throw new Error("invalid byte conversion request");
      }
      markdown = await anydoc.toMarkdownBytes(request.bytes, request.format);
    } else if (request.kind === "materialized-path") {
      if (typeof request.filePath !== "string") {
        throw new Error("invalid materialized path request");
      }
      markdown = await anydoc.toMarkdown(request.filePath);
    } else {
      throw new Error("unsupported conversion request");
    }
    if (typeof markdown !== "string") throw new Error("invalid conversion result");
    if (Buffer.byteLength(markdown, "utf8") > outputLimit(request)) {
      throw new Error("conversion output exceeds its limit");
    }
    reply({ type: "result", ok: true, markdown });
  } catch (error) {
    reply({ type: "result", ok: false, failureCode: failureCode(error) });
  }
});
