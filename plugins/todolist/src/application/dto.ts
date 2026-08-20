import type { DateTimeValue, ExecutionMode, PermissionMode, Priority, ResourceRef, TriggerConfig, ViewName } from "../domain/model.ts";

export interface CreateTodoInput {
  title: unknown;
  description?: unknown;
  projectId?: unknown;
  tags?: unknown;
  priority?: unknown;
  plannedFor?: unknown;
  deadline?: unknown;
  mode?: unknown;
  reminderTrigger?: unknown;
  agentTrigger?: unknown;
  agentId?: unknown;
  instructions?: unknown;
  permissionMode?: unknown;
  workspaceRef?: unknown;
  commandId?: unknown;
}

export interface NormalizedCreateTodoInput {
  title: string;
  description: string;
  projectId?: string;
  tags: string[];
  priority: Priority;
  plannedFor?: DateTimeValue;
  deadline?: DateTimeValue;
  mode: ExecutionMode;
  reminderTrigger?: TriggerConfig;
  agentTrigger?: TriggerConfig;
  agentId?: string;
  instructions?: string;
  permissionMode?: PermissionMode;
  workspaceRef?: ResourceRef;
  commandId?: string;
}

export interface UpdateTodoInput {
  patch: unknown;
  expectedVersion: unknown;
  mutationId?: unknown;
}

export interface QueryTodoInput {
  view?: ViewName;
  projectId?: string;
  search?: string;
  tags?: string[];
  priorities?: Priority[];
  modes?: ExecutionMode[];
  limit?: number;
  cursor?: string;
  timeZone?: string;
  today?: string;
  includeTrash?: boolean;
}

export interface BatchMutationInput {
  todoIds: string[];
  expectedVersions: Record<string, number>;
  operation: "complete" | "trash" | "move_project" | "set_priority" | "set_tags";
  value?: unknown;
  commandId?: string;
}
