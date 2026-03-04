import { prisma } from "./prisma";
import { EventType } from "@prisma/client";

export interface IngestPayload {
  session_id: string;
  session_key?: string;
  agent_id?: string;
  label?: string;
  model?: string;
  timestamp: string;
  type: string;
  tool_name?: string;
  sub_agent_id?: string;
  cron_job_id?: string;
  input?: unknown;
  output?: unknown;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_tokens?: number;
  error?: string;
  status?: string;
  metadata?: unknown;
}

function mapEventType(type: string): EventType {
  const map: Record<string, EventType> = {
    tool_call: EventType.TOOL_CALL,
    message_send: EventType.MESSAGE_SEND,
    agent_spawn: EventType.AGENT_SPAWN,
    cron_run: EventType.CRON_RUN,
    error: EventType.ERROR,
    session_start: EventType.SESSION_START,
    session_end: EventType.SESSION_END,
    model_switch: EventType.MODEL_SWITCH,
  };
  return map[type.toLowerCase()] ?? EventType.TOOL_CALL;
}

export async function ingestEvent(payload: IngestPayload) {
  const ts = new Date(payload.timestamp);

  // Upsert session
  await prisma.session.upsert({
    where: { id: payload.session_id },
    create: {
      id: payload.session_id,
      key: payload.session_key,
      agentId: payload.agent_id,
      label: payload.label,
      model: payload.model,
      startedAt: ts,
      lastSeenAt: ts,
      totalEvents: 1,
      totalTokens: (payload.output_tokens ?? 0) + (payload.input_tokens ?? 0),
      totalErrors: payload.error || payload.status === "error" ? 1 : 0,
    },
    update: {
      lastSeenAt: ts,
      totalEvents: { increment: 1 },
      totalTokens: {
        increment: (payload.output_tokens ?? 0) + (payload.input_tokens ?? 0),
      },
      totalErrors: {
        increment: payload.error || payload.status === "error" ? 1 : 0,
      },
    },
  });

  // Create event
  const event = await prisma.event.create({
    data: {
      sessionId: payload.session_id,
      timestamp: ts,
      type: mapEventType(payload.type),
      toolName: payload.tool_name,
      subAgentId: payload.sub_agent_id,
      cronJobId: payload.cron_job_id,
      input: payload.input as any,
      output: payload.output as any,
      durationMs: payload.duration_ms,
      model: payload.model,
      inputTokens: payload.input_tokens,
      outputTokens: payload.output_tokens,
      cacheTokens: payload.cache_tokens,
      error: payload.error,
      status: payload.status ?? "ok",
      metadata: payload.metadata as any,
    },
  });

  // Broadcast to SSE clients
  broadcastEvent(event);
  return event;
}

// SSE broadcaster (in-memory for single instance, good enough for MVP)
type Listener = (data: string) => void;
const listeners = new Set<Listener>();

export function addSseListener(fn: Listener) {
  listeners.add(fn);
}
export function removeSseListener(fn: Listener) {
  listeners.delete(fn);
}
export function broadcastEvent(data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  listeners.forEach((fn) => fn(payload));
}
