"use strict";

process.on("message", () => {
  process.send?.({ type: "started" }, () => {
    process.disconnect?.();
  });
  setInterval(() => {}, 1_000);
});
