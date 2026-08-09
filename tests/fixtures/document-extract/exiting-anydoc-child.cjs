"use strict";

process.on("message", () => {
  process.send?.({ type: "started" }, () => process.exit(1));
});
