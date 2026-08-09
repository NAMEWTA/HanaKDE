"use strict";

process.on("message", () => {
  process.send?.({ type: "started" });
  process.send?.({ type: "result", ok: true, markdown: 42 });
  setInterval(() => {}, 1_000);
});
