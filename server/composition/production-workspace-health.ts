import { Hono } from "hono";

const HEALTH_STATES = new Set(["HEALTHY", "DEGRADED", "RECONCILING", "FAILED"]);

/**
 * Exposes only aggregate production-owner proof. Paths, root identities, and
 * owner handles remain inside the Engine process.
 */
export function createProductionWorkspaceHealthRoute(engine: any) {
  const route = new Hono();

  route.get("/workspace/health", (c) => {
    try {
      return c.json(sanitizeProductionWorkspaceHealth(engine?.getProductionWorkspaceHealth?.()));
    } catch {
      return c.json(failedProductionWorkspaceHealth());
    }
  });

  return route;
}

function sanitizeProductionWorkspaceHealth(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!input || !HEALTH_STATES.has(String(input.state))) return failedProductionWorkspaceHealth();
  const legacy = sanitizeOwnerCounts(input.legacy);
  const coordinator = sanitizeOwnerCounts(input.coordinator);
  const overlap = safeCount(input.overlap);
  const hasProvenCounts = overlap !== null
    && hasAllCounts(legacy)
    && hasAllCounts(coordinator);
  const hasUnprovenFailure = input.state === "FAILED"
    && overlap === null
    && hasNoCounts(legacy)
    && hasNoCounts(coordinator);
  if (!hasProvenCounts && !hasUnprovenFailure) return failedProductionWorkspaceHealth();
  return {
    state: input.state,
    overlap,
    legacy,
    coordinator,
  };
}

function failedProductionWorkspaceHealth() {
  return {
    state: "FAILED",
    overlap: null,
    legacy: { watchers: null, mutations: null, baselines: null },
    coordinator: { watchers: null, mutations: null, baselines: null },
  };
}

function sanitizeOwnerCounts(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    watchers: safeCount(input.watchers),
    mutations: safeCount(input.mutations),
    baselines: safeCount(input.baselines),
  };
}

function safeCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function hasAllCounts(value: Record<string, number | null>): boolean {
  return value.watchers !== null && value.mutations !== null && value.baselines !== null;
}

function hasNoCounts(value: Record<string, number | null>): boolean {
  return value.watchers === null && value.mutations === null && value.baselines === null;
}
