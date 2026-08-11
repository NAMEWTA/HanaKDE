import fs from "node:fs/promises";
import path from "node:path";

export const ENGINE_TOOL_HARNESS_PROVIDER_ID = "e2e-engine-tool-faux";
export const ENGINE_TOOL_HARNESS_MODEL_ID = "e2e-engine-tool-model";
export const ENGINE_TOOL_HARNESS_TOOL_CALL_ID = "e2e-write-main-file";
export const ENGINE_TOOL_HARNESS_REL_PATH = "Agent History E2E.md";
export const ENGINE_TOOL_HARNESS_CONTENT = "# Agent History E2E\n\nWritten by the production Agent tool chain.\n";
export const ENGINE_TOOL_HARNESS_COMPLETE = "E2E_ENGINE_WRITE_COMPLETE";

export async function seedEngineToolHarness(hanaHome: string): Promise<void> {
  const pluginDir = path.join(hanaHome, "plugins", ENGINE_TOOL_HARNESS_PROVIDER_ID);
  const providerDir = path.join(pluginDir, "providers");
  const piAiModuleUrl = import.meta.resolve("@earendil-works/pi-ai");
  await fs.mkdir(providerDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(pluginDir, "manifest.json"),
      `${JSON.stringify({
        id: ENGINE_TOOL_HARNESS_PROVIDER_ID,
        name: "E2E Engine Tool Faux Provider",
        version: "1.0.0",
        description: "Deterministic provider for the isolated Engine tool-chain gate.",
        trust: "full-access",
        hidden: true,
        activationEvents: ["onStartup"],
      }, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(pluginDir, "package.json"),
      `${JSON.stringify({ type: "module" }, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(providerDir, `${ENGINE_TOOL_HARNESS_PROVIDER_ID}.js`),
      providerModuleSource(piAiModuleUrl),
      "utf8",
    ),
  ]);
}

function providerModuleSource(piAiModuleUrl: string): string {
  return `import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from ${JSON.stringify(piAiModuleUrl)};

export const id = ${JSON.stringify(ENGINE_TOOL_HARNESS_PROVIDER_ID)};
export const displayName = "E2E Engine Tool Faux Provider";
export const authType = "none";
export const defaultBaseUrl = "http://localhost:0";
export const defaultApi = "faux";
export const models = [{
  id: ${JSON.stringify(ENGINE_TOOL_HARNESS_MODEL_ID)},
  name: "E2E Engine Tool Model",
  contextWindow: 128000,
  maxTokens: 4096,
  reasoning: false,
}];

const toolCallId = ${JSON.stringify(ENGINE_TOOL_HARNESS_TOOL_CALL_ID)};
const faux = fauxProvider({
  api: "faux",
  provider: id,
  models,
});
faux.setResponses([
  fauxAssistantMessage(
    fauxToolCall("write", {
      path: ${JSON.stringify(ENGINE_TOOL_HARNESS_REL_PATH)},
      content: ${JSON.stringify(ENGINE_TOOL_HARNESS_CONTENT)},
    }, { id: toolCallId }),
    { stopReason: "toolUse" },
  ),
  (context) => {
    const result = [...context.messages].reverse().find((message) => (
      message.role === "toolResult" && message.toolCallId === toolCallId
    ));
    if (!result || result.toolName !== "write" || result.isError !== false) {
      throw new Error("E2E write tool did not produce a successful toolResult");
    }
    return fauxAssistantMessage(${JSON.stringify(ENGINE_TOOL_HARNESS_COMPLETE)});
  },
]);

export const sdkProvider = {
  providerId: id,
  config: {
    api: "faux",
    streamSimple: faux.provider.streamSimple,
  },
};
`;
}
