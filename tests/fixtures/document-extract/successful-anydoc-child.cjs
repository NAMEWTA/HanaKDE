"use strict";

process.on("message", () => {
  process.send?.({ type: "started" });
  process.send?.({ type: "result", ok: true, markdown: "# converted in child" }, () => process.exit(0));
});
