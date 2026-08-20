const fs = require("fs");

function readOptionalJSON(filePath, fallback = null, opts = {}) {
  const readFile = opts.readFile || ((target) => fs.readFileSync(target, "utf8"));
  const log = opts.log || (() => {});
  try {
    return JSON.parse(readFile(filePath));
  } catch (error) {
    if (error?.code !== "ENOENT") log(error, filePath);
    return fallback;
  }
}

module.exports = { readOptionalJSON };
