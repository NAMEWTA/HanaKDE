/**
 * 静态提取并校验 workflow 脚本开头的 `export const meta = {...}` 字面量，
 * 返回 meta 对象与剥离 export 后可在 async function 里执行的 body。
 * meta 必须是纯对象字面量（spec 约束：无变量 / 函数调用 / 模板插值）。
 * @param {string} script
 * @returns {{ meta: { name: string, description: string, phases?: any[] }, body: string }}
 */
export function extractMeta(script) {
  if (typeof script !== "string" || !script.trim()) {
    throw new Error("workflow script 不能为空");
  }
  const marker = /export\s+const\s+meta\s*=/.exec(script);
  if (!marker) {
    throw new Error("workflow script 必须以 export const meta = {...} 开头");
  }
  const braceStart = script.indexOf("{", marker.index + marker[0].length);
  if (braceStart === -1) throw new Error("workflow meta 必须是对象字面量");
  const braceEnd = matchBrace(script, braceStart);
  if (braceEnd === -1) throw new Error("workflow meta 对象字面量未闭合");

  const literal = script.slice(braceStart, braceEnd + 1);
  let meta;
  try {
    meta = parseStaticMetaLiteral(literal);
  } catch (err) {
    throw new Error("workflow meta 不是合法对象字面量: " + err.message);
  }
  if (!meta || typeof meta !== "object" ||
      typeof meta.name !== "string" || typeof meta.description !== "string") {
    throw new Error("workflow meta 必须含 name 和 description 字符串");
  }

  const strippedMeta =
    script.slice(0, marker.index) +
    script.slice(marker.index).replace(/export\s+const\s+meta/, "const meta");
  return { meta, body: normalizeExports(strippedMeta) };
}

/**
 * `meta` is configuration, not executable workflow code. Parse only the
 * literal subset we support instead of evaluating it in a VM: this keeps the
 * boundary non-executable and avoids a scheduler-sensitive VM timeout on
 * saturated Windows CI workers.
 */
function parseStaticMetaLiteral(source: string): Record<string, unknown> {
  const parser = new StaticLiteralParser(source);
  const value = parser.parse();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("meta 必须是对象字面量");
  }
  return value as Record<string, unknown>;
}

class StaticLiteralParser {
  #source: string;
  #index = 0;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): unknown {
    const value = this.#parseValue();
    this.#skipWhitespace();
    if (this.#index !== this.#source.length) this.#error("对象字面量后存在额外内容");
    return value;
  }

  #parseValue(): unknown {
    this.#skipWhitespace();
    const current = this.#source[this.#index];
    if (current === "{") return this.#parseObject();
    if (current === "[") return this.#parseArray();
    if (current === "\"" || current === "'") return this.#parseString();
    if (current === "-" || isDigit(current)) return this.#parseNumber();
    const identifier = this.#parseIdentifier();
    if (identifier === "true") return true;
    if (identifier === "false") return false;
    if (identifier === "null") return null;
    this.#error("只允许静态字面量值");
  }

  #parseObject(): Record<string, unknown> {
    this.#expect("{");
    const result = Object.create(null) as Record<string, unknown>;
    this.#skipWhitespace();
    if (this.#consume("}")) return result;
    while (true) {
      const key = this.#parsePropertyKey();
      this.#skipWhitespace();
      this.#expect(":");
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        this.#error("对象字面量不能包含重复字段");
      }
      Object.defineProperty(result, key, {
        value: this.#parseValue(),
        enumerable: true,
        configurable: false,
        writable: false,
      });
      this.#skipWhitespace();
      if (this.#consume("}")) return result;
      this.#expect(",");
      this.#skipWhitespace();
      if (this.#consume("}")) return result;
    }
  }

  #parseArray(): unknown[] {
    this.#expect("[");
    const values: unknown[] = [];
    this.#skipWhitespace();
    if (this.#consume("]")) return values;
    while (true) {
      values.push(this.#parseValue());
      this.#skipWhitespace();
      if (this.#consume("]")) return values;
      this.#expect(",");
      this.#skipWhitespace();
      if (this.#consume("]")) return values;
    }
  }

  #parsePropertyKey(): string {
    this.#skipWhitespace();
    const current = this.#source[this.#index];
    if (current === "\"" || current === "'") return this.#parseString();
    return this.#parseIdentifier();
  }

  #parseIdentifier(): string {
    this.#skipWhitespace();
    const remaining = this.#source.slice(this.#index);
    const match = /^[A-Za-z_$][A-Za-z0-9_$]*/u.exec(remaining);
    if (!match) this.#error("需要对象字段或字面量值");
    this.#index += match![0].length;
    return match![0];
  }

  #parseNumber(): number {
    const remaining = this.#source.slice(this.#index);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(remaining);
    if (!match) this.#error("无效数字字面量");
    this.#index += match![0].length;
    const value = Number(match![0]);
    if (!Number.isFinite(value)) this.#error("数字必须是有限值");
    return value;
  }

  #parseString(): string {
    const quote = this.#source[this.#index++];
    let value = "";
    while (this.#index < this.#source.length) {
      const current = this.#source[this.#index++];
      if (current === quote) return value;
      if (current === "\\") {
        value += this.#parseEscape();
        continue;
      }
      if (current < " ") this.#error("字符串不能含未转义控制字符");
      value += current;
    }
    this.#error("字符串字面量未闭合");
  }

  #parseEscape(): string {
    const escaped = this.#source[this.#index++];
    const simple: Record<string, string> = {
      "\"": "\"", "'": "'", "\\": "\\", b: "\b", f: "\f", n: "\n",
      r: "\r", t: "\t", v: "\v",
    };
    if (escaped in simple) return simple[escaped];
    if (escaped === "0") {
      if (isDigit(this.#source[this.#index])) this.#error("八进制转义不受支持");
      return "\0";
    }
    if (escaped === "x") return String.fromCharCode(this.#readHex(2));
    if (escaped === "u") {
      if (this.#consume("{")) {
        const start = this.#index;
        while (isHexDigit(this.#source[this.#index])) this.#index += 1;
        const digits = this.#source.slice(start, this.#index);
        this.#expect("}");
        if (!digits || digits.length > 6) this.#error("无效 Unicode 转义");
        return String.fromCodePoint(Number.parseInt(digits, 16));
      }
      return String.fromCharCode(this.#readHex(4));
    }
    if (escaped === "\r") {
      this.#consume("\n");
      return "";
    }
    if (escaped === "\n") return "";
    if (!escaped) this.#error("无效字符串转义");
    return escaped;
  }

  #readHex(length: number): number {
    const digits = this.#source.slice(this.#index, this.#index + length);
    if (digits.length !== length || ![...digits].every(isHexDigit)) {
      this.#error("无效十六进制转义");
    }
    this.#index += length;
    return Number.parseInt(digits, 16);
  }

  #skipWhitespace(): void {
    while (/\s/u.test(this.#source[this.#index] ?? "")) this.#index += 1;
  }

  #consume(expected: string): boolean {
    if (!this.#source.startsWith(expected, this.#index)) return false;
    this.#index += expected.length;
    return true;
  }

  #expect(expected: string): void {
    this.#skipWhitespace();
    if (!this.#consume(expected)) this.#error(`需要 \`${expected}\``);
  }

  #error(message: string): never {
    throw new Error(`${message}（offset ${this.#index}）`);
  }
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}

function isHexDigit(value: string | undefined): boolean {
  return value !== undefined && /^[0-9a-f]$/iu.test(value);
}

/**
 * 归一化 meta 之外的 export，使脚本能在 vm 非模块上下文执行（vm 不认 export，
 * 否则报 "Unexpected token 'export'"）。模型常把 workflow 写成
 * `export default async function(api){...}`（合法且自然），必须支持：
 * - `export default <expr>` → `const __wf_default = <expr>`，并在末尾
 *   `return await __wf_default(__wf_api)`（__wf_api 由 sandbox 注入完整 host API；
 *   入口是函数则用 host API 调用，非函数则直接作结果）。
 * - 其余 `export const/let/var/function/class/async` → 剥掉 export 前缀成局部声明。
 * @param {string} body
 * @returns {string}
 */
function normalizeExports(body) {
  let hasDefault = false;
  let out = body.replace(/export\s+default\s+/, () => {
    hasDefault = true;
    return "const __wf_default = ";
  });
  out = out.replace(/export\s+(?=(?:const|let|var|function|class|async)\b)/g, "");
  if (hasDefault) {
    out += "\n;return await (typeof __wf_default === 'function' ? __wf_default(__wf_api) : __wf_default);";
  }
  return out;
}

/**
 * 从 start 处的 `{` 找到配对的 `}`（跳过字符串字面量内的花括号）。
 * @param {string} s
 * @param {number} start
 * @returns {number} 配对 `}` 的下标，未闭合返回 -1
 */
function matchBrace(s, start) {
  let depth = 0;
  let inStr = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
