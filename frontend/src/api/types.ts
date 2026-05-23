// Mirror of the JSON shapes returned by the Flask API.
// Kept hand-written (instead of generated) so the surface area is obvious.

export interface User {
  id: number;
  name: string;
  email: string;
  company_name?: string | null;
  company_description?: string | null;
  industry?: string | null;
  target_audience?: string | null;
  brand_voice?: string | null;
  created_at?: string;
}

export interface BlogIdea {
  id: number;
  planner_id: number;
  title: string;
  description?: string | null;
  angle?: string | null;
  keywords: string[];
  status: 'idea' | 'in_progress' | 'completed';
  created_at: string;
}

export interface SessionRow {
  id: number;
  blog_idea_id: number;
  plan?: string | null;
  content?: string | null;
  status: 'planning' | 'plan_ready' | 'executing' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  session_id: number | null;
  user_id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_name?: string | null;
  tool_input?: Record<string, unknown> | null;
  tool_output?: Record<string, unknown> | null;
  context_used?: ContextUsed | null;
  created_at: string;
}

export interface ContextUsed {
  brain_fields?: string[];
  prior_messages?: number;
  tools_called?: Array<{ name: string; input?: unknown; server_side?: boolean }>;
  artifacts_referenced?: number[];
}

// === SSE event payloads ===
export type AgentEvent =
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool_use_start'; data: { tool_name: string; tool_use_id: string; server_side?: boolean } }
  | { event: 'tool_use_input'; data: { tool_use_id: string; input: Record<string, unknown> } }
  | { event: 'tool_result'; data: { tool_use_id: string; output: unknown; is_error: boolean } }
  | { event: 'artifact_update'; data: { resource: string; action: string; data: any } }
  | { event: 'done'; data: { assistant_message_id: number; context_used: ContextUsed } }
  | { event: 'error'; data: { message: string } };

// === Local chat-rendering shape ===
export interface ToolCall {
  tool_use_id: string;
  tool_name: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: 'running' | 'done' | 'error';
  server_side?: boolean;
}

export interface ChatMessage {
  id: number | string; // server id when persisted, temp string when streaming
  role: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCall[];
  context_used?: ContextUsed | null;
  streaming?: boolean;
}
