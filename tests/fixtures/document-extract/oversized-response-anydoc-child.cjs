"use strict";

process.on("message", () => {
  process.send?.({ type: "started" });
  process.send?.({ type: "result", ok: true, markdown: "x".repeat(65) }, () => process.exit(0));
});
