import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ResourceIOError } from "./errors.ts";
import type { ResourceRef, ResourceVersion } from "./types.ts";

const MAGIC = "HSF1";
const PROTOCOL_VERSION = 1;
const MAX_REQUEST_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_FRAME_BYTES = 512;
const HELPER_TIMEOUT_MS = 10_000;
const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const enum HelperStatus {
  Written = 1,
  Conflict = 2,
  Unsafe = 3,
  Unavailable = 4,
  ProtocolFailure = 5,
}

export type NativeFileIdentity = Readonly<{
  device: string;
  inode: string;
  birthtimeNs: string;
}>;

export type NativeFileProof = Readonly<{
  identity: NativeFileIdentity;
  mtimeNs: string;
  size: string;
}>;

export type LocalSecureWriteProof = Readonly<{
  rootPath: string;
  segments: readonly string[];
  root: NativeFileIdentity;
  ancestors: readonly NativeFileIdentity[];
  final: NativeFileProof | null;
}>;

export type SecureConditionalWriteResult =
  | Readonly<{
    kind: "written";
    changeType: "created" | "modified";
    version: ResourceVersion;
  }>
  | Readonly<{
    kind: "conflict";
    version?: ResourceVersion;
  }>;

type NativeConditionalWriteInput = Readonly<{
  proof: LocalSecureWriteProof;
  content: Buffer;
  expectedVersion: ResourceVersion | null;
}>;

type NativeConditionalWriteRunner = (
  input: NativeConditionalWriteInput,
) => Promise<SecureConditionalWriteResult>;

type HelperCommand = Readonly<{
  command: string;
  args: readonly string[];
}>;

function createNativeConditionalWriteRunner(): NativeConditionalWriteRunner {
  return async (input) => {
    const request = encodeRequest(input);
    const response = await runHelper(resolveHelperCommand(), request);
    return decodeResponse(response, input.proof.final === null ? "created" : "modified");
  };
}

const nativeConditionalWriteRunner = createNativeConditionalWriteRunner();
const localSecureWriteProofs = new WeakMap<object, LocalSecureWriteProof>();

/**
 * This is deliberately an internal provider seam rather than a ResourceRef
 * property. A caller can manufacture a structurally similar ref, but cannot
 * attach a proof that this module will accept.
 */
export async function withLocalSecureWriteProof<T>(
  ref: ResourceRef,
  proof: LocalSecureWriteProof,
  operation: () => Promise<T>,
): Promise<T> {
  if (!isLocalSecureWriteProof(proof) || localSecureWriteProofs.has(ref)) {
    throw secureWriteUnsafeError();
  }
  localSecureWriteProofs.set(ref, proof);
  try {
    return await operation();
  } finally {
    localSecureWriteProofs.delete(ref);
  }
}

export async function secureConditionalWrite(
  ref: ResourceRef,
  content: string | Buffer,
  expectedVersion: ResourceVersion | null,
): Promise<SecureConditionalWriteResult> {
  const proof = secureWriteProofFromRef(ref);
  return nativeConditionalWriteRunner({
    proof,
    content: Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(content, "utf8"),
    expectedVersion,
  });
}

function secureWriteProofFromRef(ref: ResourceRef): LocalSecureWriteProof {
  const proof = localSecureWriteProofs.get(ref);
  if (!proof) {
    throw secureWriteUnsafeError();
  }
  return proof;
}

function isLocalSecureWriteProof(value: unknown): value is LocalSecureWriteProof {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value as LocalSecureWriteProof;
  return typeof proof.rootPath === "string"
    && path.isAbsolute(proof.rootPath)
    && Array.isArray(proof.segments)
    && proof.segments.length > 0
    && proof.segments.every(isSafeSegment)
    && isNativeFileIdentity(proof.root)
    && Array.isArray(proof.ancestors)
    && proof.ancestors.length === proof.segments.length - 1
    && proof.ancestors.every(isNativeFileIdentity)
    && (proof.final === null || isNativeFileProof(proof.final));
}

function isSafeSegment(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !value.includes("\\")
    && !value.includes(":")
    && !containsSecureWriteControlCharacter(value)
    && !/[. ]$/u.test(value)
    && !/[<>"|?*]/u.test(value);
}

function containsSecureWriteControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isNativeFileIdentity(value: unknown): value is NativeFileIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value as NativeFileIdentity;
  return isUnsignedIntegerString(identity.device)
    && isUnsignedIntegerString(identity.inode)
    && isUnsignedIntegerString(identity.birthtimeNs);
}

function isNativeFileProof(value: unknown): value is NativeFileProof {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value as NativeFileProof;
  return isNativeFileIdentity(proof.identity)
    && isUnsignedIntegerString(proof.mtimeNs)
    && isUnsignedIntegerString(proof.size);
}

function isUnsignedIntegerString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) >= 0n && BigInt(value) <= 0xffff_ffff_ffff_ffffn;
  } catch {
    return false;
  }
}

function encodeRequest(input: NativeConditionalWriteInput): Buffer {
  const { proof, content } = input;
  if (content.byteLength > MAX_REQUEST_FRAME_BYTES) throw secureWriteUnavailableError();
  const writer = new FrameWriter();
  writer.bytes(Buffer.from(MAGIC, "ascii"));
  writer.u8(PROTOCOL_VERSION);
  writer.u8(1);
  writer.u8(proof.final === null ? 0 : 1);
  writer.u16(proof.segments.length);
  writer.string(proof.rootPath, 32 * 1024);
  for (const segment of proof.segments) writer.string(segment, 512);
  writer.identity(proof.root);
  for (const ancestor of proof.ancestors) writer.identity(ancestor);
  if (proof.final) writer.fileProof(proof.final);
  writer.u32(content.byteLength);
  writer.bytes(content);
  const body = writer.finish();
  if (body.byteLength > MAX_REQUEST_FRAME_BYTES) throw secureWriteUnavailableError();
  const frame = Buffer.allocUnsafe(4 + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, 4);
  return frame;
}

function decodeResponse(frame: Buffer, changeType: "created" | "modified"): SecureConditionalWriteResult {
  const body = decodeSingleFrame(frame, MAX_RESPONSE_FRAME_BYTES);
  const reader = new FrameReader(body);
  if (reader.ascii(4) !== MAGIC || reader.u8() !== PROTOCOL_VERSION) throw secureWriteProtocolError();
  const status = reader.u8();
  const mtimeNs = reader.u64();
  const size = reader.u64();
  if (!reader.finished()) throw secureWriteProtocolError();
  if (status === HelperStatus.Written) {
    return Object.freeze({
      kind: "written" as const,
      changeType,
      version: versionFromNativeResponse(mtimeNs, size),
    });
  }
  if (status === HelperStatus.Conflict) {
    return Object.freeze({
      kind: "conflict" as const,
      ...(mtimeNs > 0n || size > 0n ? { version: versionFromNativeResponse(mtimeNs, size) } : {}),
    });
  }
  if (status === HelperStatus.Unsafe) throw secureWriteUnsafeError();
  if (status === HelperStatus.Unavailable) throw secureWriteUnavailableError();
  throw secureWriteProtocolError();
}

function versionFromNativeResponse(mtimeNs: bigint, size: bigint): ResourceVersion {
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw secureWriteProtocolError();
  const mtimeMs = nativeMtimeNsToResourceMilliseconds(mtimeNs);
  return Object.freeze({ mtimeMs, size: Number(size) });
}

function nativeMtimeNsToResourceMilliseconds(mtimeNs: bigint): number {
  const roundedMilliseconds = (mtimeNs + 500_000n) / 1_000_000n;
  const mtimeMs = Number(roundedMilliseconds);
  if (!Number.isSafeInteger(mtimeMs) || mtimeMs < 0) throw secureWriteProtocolError();
  return mtimeMs;
}

function decodeSingleFrame(frame: Buffer, maxBytes: number): Buffer {
  if (frame.byteLength < 4) throw secureWriteProtocolError();
  const length = frame.readUInt32BE(0);
  if (length > maxBytes || frame.byteLength !== 4 + length) throw secureWriteProtocolError();
  return frame.subarray(4);
}

function resolveHelperCommand(): HelperCommand {
  const testOverride = process.env.NODE_ENV === "test"
    ? process.env.HANA_SECURE_FS_HELPER_PATH
    : undefined;
  const helperPath = testOverride || defaultHelperPath();
  if (!helperPath || !fs.existsSync(helperPath)) throw secureWriteUnavailableError();
  if (process.env.NODE_ENV === "test" && /\.(?:cjs|mjs|js)$/i.test(helperPath)) {
    return Object.freeze({ command: process.execPath, args: Object.freeze([helperPath]) });
  }
  return Object.freeze({ command: helperPath, args: Object.freeze([]) });
}

function defaultHelperPath(): string {
  const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : process.platform;
  const extension = process.platform === "win32" ? ".exe" : "";
  return path.join(MODULE_ROOT, "dist-secure-fs", `${platform}-${process.arch}`, `hana-secure-fs-helper${extension}`);
}

function runHelper(command: HelperCommand, request: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = Buffer.alloc(0);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    let child;
    try {
      child = spawn(command.command, [...command.args], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      reject(secureWriteUnavailableError());
      return;
    }
    const timeout = setTimeout(() => {
      child.kill();
      settle(() => reject(secureWriteUnavailableError()));
    }, HELPER_TIMEOUT_MS);
    timeout.unref?.();
    child.once("error", () => settle(() => reject(secureWriteUnavailableError())));
    child.stdout.on("data", (chunk: Buffer | Uint8Array) => {
      if (settled) return;
      const nextLength = stdout.byteLength + chunk.byteLength;
      if (nextLength > 4 + MAX_RESPONSE_FRAME_BYTES) {
        child.kill();
        settle(() => reject(secureWriteProtocolError()));
        return;
      }
      stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
    });
    child.stderr.resume();
    child.stdin.once("error", () => {
      child.kill();
      settle(() => reject(secureWriteUnavailableError()));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        settle(() => reject(secureWriteUnavailableError()));
        return;
      }
      settle(() => resolve(stdout));
    });
    child.stdin.end(request);
  });
}

class FrameWriter {
  #parts: Buffer[] = [];
  #length = 0;

  bytes(value: Buffer): void {
    this.#parts.push(value);
    this.#length += value.byteLength;
    if (this.#length > MAX_REQUEST_FRAME_BYTES) throw secureWriteUnavailableError();
  }

  u8(value: number): void {
    const buffer = Buffer.allocUnsafe(1);
    buffer.writeUInt8(value, 0);
    this.bytes(buffer);
  }

  u16(value: number): void {
    const buffer = Buffer.allocUnsafe(2);
    buffer.writeUInt16BE(value, 0);
    this.bytes(buffer);
  }

  u32(value: number): void {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt32BE(value, 0);
    this.bytes(buffer);
  }

  u64(value: string): void {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigUInt64BE(BigInt(value), 0);
    this.bytes(buffer);
  }

  string(value: string, maximumBytes: number): void {
    const encoded = Buffer.from(value, "utf8");
    if (encoded.byteLength === 0 || encoded.byteLength > maximumBytes || encoded.includes(0)) {
      throw secureWriteUnsafeError();
    }
    this.u32(encoded.byteLength);
    this.bytes(encoded);
  }

  identity(value: NativeFileIdentity): void {
    this.u64(value.device);
    this.u64(value.inode);
    this.u64(value.birthtimeNs);
  }

  fileProof(value: NativeFileProof): void {
    this.identity(value.identity);
    this.u64(value.mtimeNs);
    this.u64(value.size);
  }

  finish(): Buffer {
    return Buffer.concat(this.#parts, this.#length);
  }
}

class FrameReader {
  #offset = 0;
  #body: Buffer;

  constructor(body: Buffer) {
    this.#body = body;
  }

  ascii(length: number): string {
    return this.read(length).toString("ascii");
  }

  u8(): number {
    return this.read(1).readUInt8(0);
  }

  u64(): bigint {
    return this.read(8).readBigUInt64BE(0);
  }

  finished(): boolean {
    return this.#offset === this.#body.byteLength;
  }

  private read(length: number): Buffer {
    if (length < 0 || this.#offset + length > this.#body.byteLength) throw secureWriteProtocolError();
    const value = this.#body.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }
}

function secureWriteUnsafeError(): ResourceIOError {
  return new ResourceIOError("Secure conditional write rejected", {
    code: "resource_version_conflict",
    status: 409,
  });
}

function secureWriteUnavailableError(): ResourceIOError {
  return new ResourceIOError("Secure conditional write helper is unavailable", {
    code: "provider_not_available",
    status: 503,
  });
}

function secureWriteProtocolError(): ResourceIOError {
  return new ResourceIOError("Secure conditional write protocol failed", {
    code: "secure_write_protocol_error",
    status: 503,
  });
}
