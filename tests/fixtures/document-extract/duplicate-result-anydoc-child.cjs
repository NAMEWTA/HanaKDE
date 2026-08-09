"use strict";

process.on("message", () => {
  process.send?.({ type: "started" });
  process.send?.({ type: "result", ok: true, markdown: "first" });
  process.send?.({ type: "result", ok: true, markdown: "second" });
  setInterval(() => {}, 1_000);
});
