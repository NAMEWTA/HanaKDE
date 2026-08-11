const fs = require("node:fs");
const path = require("node:path");

const MAGIC = "HSF1";
const VERSION = 1;
const STATUS_WRITTEN = 1;
const STATUS_CONFLICT = 2;
const MAX_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_ROOT_BYTES = 32 * 1024;
const MAX_SEGMENT_BYTES = 512;

class Reader {
  constructor(body) {
    this.body = body;
    this.offset = 0;
  }

  bytes(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.body.length) {
      throw new Error("malformed request");
    }
    const result = this.body.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  ascii(length) {
    return this.bytes(length).toString("ascii");
  }

  u8() {
    return this.bytes(1).readUInt8(0);
  }

  u16() {
    return this.bytes(2).readUInt16BE(0);
  }

  u32() {
    return this.bytes(4).readUInt32BE(0);
  }

  u64() {
    return this.bytes(8).readBigUInt64BE(0);
  }

  string(maximumBytes) {
    const value = this.bytes(this.u32());
    if (value.length === 0 || value.length > maximumBytes || value.includes(0)) {
      throw new Error("invalid request string");
    }
    return value.toString("utf8");
  }

  identity() {
    this.u64();
    this.u64();
    this.u64();
  }

  finished() {
    return this.offset === this.body.length;
  }
}

function parseRequest(frame) {
  if (frame.length < 4) throw new Error("malformed request frame");
  const length = frame.readUInt32BE(0);
  if (length > MAX_FRAME_BYTES || frame.length !== length + 4) {
    throw new Error("invalid request frame length");
  }
  const reader = new Reader(frame.subarray(4));
  if (reader.ascii(4) !== MAGIC || reader.u8() !== VERSION || reader.u8() !== 1) {
    throw new Error("invalid request header");
  }
  const hasFinal = reader.u8();
  if (hasFinal !== 0 && hasFinal !== 1) throw new Error("invalid final flag");
  const segmentCount = reader.u16();
  if (segmentCount < 1 || segmentCount > 1024) throw new Error("invalid segment count");
  const rootPath = reader.string(MAX_ROOT_BYTES);
  if (!path.isAbsolute(rootPath)) throw new Error("root path must be absolute");
  const segments = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const segment = reader.string(MAX_SEGMENT_BYTES);
    if (
      segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
      || segment.includes("\0")
    ) {
      throw new Error("invalid path segment");
    }
    segments.push(segment);
  }
  reader.identity();
  for (let index = 1; index < segmentCount; index += 1) reader.identity();
  if (hasFinal) {
    reader.identity();
    reader.u64();
    reader.u64();
  }
  const content = reader.bytes(reader.u32());
  if (!reader.finished()) throw new Error("trailing request bytes");
  return { hasFinal: hasFinal === 1, rootPath, segments, content };
}

function targetForRequest(request) {
  const targetPath = path.resolve(request.rootPath, ...request.segments);
  const relative = path.relative(request.rootPath, targetPath);
  if (
    relative.length === 0
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("target escapes root");
  }
  return targetPath;
}

function response(status, mtimeNs = 0n, size = 0n) {
  const body = Buffer.alloc(22);
  body.write(MAGIC, 0, "ascii");
  body.writeUInt8(VERSION, 4);
  body.writeUInt8(status, 5);
  body.writeBigUInt64BE(mtimeNs, 6);
  body.writeBigUInt64BE(size, 14);
  const frame = Buffer.alloc(4 + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  process.stdout.write(frame);
}

function applyRequest(request) {
  const targetPath = targetForRequest(request);
  if (request.hasFinal) {
    let stat;
    try {
      stat = fs.lstatSync(targetPath, { bigint: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return { status: STATUS_CONFLICT };
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) return { status: STATUS_CONFLICT };
    fs.writeFileSync(targetPath, request.content);
  } else {
    try {
      fs.writeFileSync(targetPath, request.content, { flag: "wx" });
    } catch (error) {
      if (error && error.code === "EEXIST") return { status: STATUS_CONFLICT };
      throw error;
    }
  }
  const stat = fs.lstatSync(targetPath, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink()) return { status: STATUS_CONFLICT };
  return { status: STATUS_WRITTEN, mtimeNs: stat.mtimeNs, size: stat.size };
}

const chunks = [];
let totalBytes = 0;
process.stdin.on("data", (chunk) => {
  totalBytes += chunk.length;
  if (totalBytes > MAX_FRAME_BYTES + 4) {
    process.stdin.destroy();
    return;
  }
  chunks.push(Buffer.from(chunk));
});
process.stdin.on("end", () => {
  if (process.env.NODE_ENV !== "test") {
    process.exitCode = 1;
    return;
  }
  try {
    const result = applyRequest(parseRequest(Buffer.concat(chunks, totalBytes)));
    if (process.env.HANA_SECURE_FS_HELPER_MARKER) {
      fs.writeFileSync(process.env.HANA_SECURE_FS_HELPER_MARKER, "invoked", "utf8");
    }
    response(result.status, result.mtimeNs, result.size);
  } catch {
    process.exitCode = 1;
  }
});
process.stdin.resume();
