"use strict";

process.on("message", () => {
  process.send?.({ type: "started" });
  setInterval(() => {}, 1_000);
});
