import { prisma } from "./prisma";
import { EventType } from "@prisma/client";
import { analyzeToolCall } from "./tool-analyzer";

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
  cost_usd?: number;
  error?: string;
  status?: string;
  metadata?: unknown;
}

function mapEventType(type: string): EventType {
  const map: Record<string, EventType> = {
    tool_call: EventType.TOOL_CALL,
    message_send: EventType.MESSAGE_SEND,
    message_sent: EventType.MESSAGE_SENT,
    message_received: EventType.MESSAGE_RECEIVED,
    agent_spawn: EventType.AGENT_SPAWN,
    agent_start: EventType.AGENT_START,
    agent_end: EventType.AGENT_END,
    llm_output: EventType.LLM_OUTPUT,
    cron_run: EventType.CRON_RUN,
    error: EventType.ERROR,
    session_start: EventType.SESSION_START,
    session_end: EventType.SESSION_END,
    model_switch: EventType.MODEL_SWITCH,
    subagent_spawning: EventType.SUBAGENT_SPAWNING,
    subagent_ended: EventType.SUBAGENT_ENDED,
  };
  return map[type.toLowerCase()] ?? EventType.TOOL_CALL;
}

export async function ingestEvent(payload: IngestPayload) {
  const ts = new Date(payload.timestamp);

  // Compute event cost: prefer explicit cost_usd, else estimate from tokens
  const eventCostUsd =
    payload.cost_usd ??
    ((payload.input_tokens ?? 0) * 3.0 +
      (payload.output_tokens ?? 0) * 15.0 +
      (payload.cache_tokens ?? 0) * 0.3) /
      1_000_000;

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
      totalCostUsd: eventCostUsd,
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
      totalCostUsd: { increment: eventCostUsd },
    },
  });

  // Enrich TOOL_CALL events with deep classification + secret detection
  const eventType = mapEventType(payload.type);
  let enrichedMetadata: Record<string, unknown> = (payload.metadata as Record<string, unknown>) ?? {};
  if (eventType === EventType.TOOL_CALL) {
    try {
      const analysis = analyzeToolCall(payload.tool_name, payload.input);
      enrichedMetadata = {
        ...enrichedMetadata,
        toolAnalysis: {
          category:    analysis.category,
          subCategory: analysis.subCategory,
          icon:        analysis.icon,
          label:       analysis.label,
          details:     analysis.details,
          risk:        analysis.risk,
          secrets:     analysis.secrets.map((s) => ({
            type:     s.type,
            label:    s.label,
            field:    s.field,
            masked:   s.masked,
            severity: s.severity,
          })),
          hasSecrets:  analysis.secrets.length > 0,
        },
      };
    } catch {
      // analysis is best-effort — never block ingestion
    }
  }

  // Create event
  const event = await prisma.event.create({
    data: {
      sessionId: payload.session_id,
      timestamp: ts,
      type: eventType,
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
      costUsd: payload.cost_usd,
      error: payload.error,
      status: payload.status ?? "ok",
      metadata: enrichedMetadata as any,
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
