import type {
  DiagnosticEventPayload,
  OpenClawPluginApi,
  OpenClawPluginService,
  PluginLogger,
} from "openclaw/plugin-sdk";
import { onDiagnosticEvent } from "openclaw/plugin-sdk";
import { RingBuffer } from "./buffer.js";

// ---------------------------------------------------------------------------
// Argus ingest payload
// ---------------------------------------------------------------------------

interface IngestPayload {
  session_id: string;
  session_key?: string;
  agent_id?: string;
  model?: string;
  timestamp: string;
  type: string;
  tool_name?: string;
  sub_agent_id?: string;
  input?: unknown;
  output?: unknown;
  input_tokens?: number;
  output_tokens?: number;
  cache_tokens?: number;
  duration_ms?: number;
  error?: string;
  status?: string;
  metadata?: unknown;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface ArgusExportConfig {
  argusUrl: string;
  apiKey: string;
  batchSize: number;
  flushIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createArgusExportService(api: OpenClawPluginApi): OpenClawPluginService {
  const buffer = new RingBuffer<IngestPayload>(500);
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeDiagnostics: (() => void) | null = null;
  let logger: PluginLogger | null = null;
  let config: ArgusExportConfig | null = null;
  let enabled = false;
  const sessionMap = new Map<string, string>();

  // Track pending tool calls start time for think-time measurement
  const toolCallStartMap = new Map<string, number>();

  // Track agent turn start times for response-time measurement
  const agentTurnStartMap = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Flush logic -- fire-and-forget, never throws
  // -------------------------------------------------------------------------

  function flush(): void {
    if (!config || buffer.size === 0) return;
    const events = buffer.drain();
    const url = `${config.argusUrl}/api/ingest`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
    void doPost(url, headers, events);
  }

  async function doPost(
    url: string,
    headers: Record<string, string>,
    events: IngestPayload[],
  ): Promise<void> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(events),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        logger?.warn(
          `argus-export: flush failed with HTTP ${res.status} (${events.length} events dropped)`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger?.warn(`argus-export: flush error: ${message} (${events.length} events dropped)`);
    }
  }

  function enqueue(payload: IngestPayload): void {
    buffer.push(payload);
    if (config && buffer.size >= config.batchSize) flush();
  }

  function now(): string {
    return new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // Service implementation
  // -------------------------------------------------------------------------

  return {
    id: "argus-export",

    start(ctx) {
      enabled = true;
      logger = ctx.logger;

      const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
      const argusUrl = process.env.ARGUS_URL?.trim() || (typeof raw.argusUrl === "string" ? raw.argusUrl : "");
      const apiKey = process.env.ARGUS_API_KEY?.trim() || (typeof raw.apiKey === "string" ? raw.apiKey : "");

      if (!argusUrl || !apiKey) {
        logger.warn("argus-export: missing argusUrl or apiKey -- telemetry export disabled");
        return;
      }

      config = {
        argusUrl: argusUrl.replace(/\/+$/, ""),
        apiKey,
        batchSize: typeof raw.batchSize === "number" ? raw.batchSize : 50,
        flushIntervalMs: typeof raw.flushIntervalMs === "number" ? raw.flushIntervalMs : 5000,
      };

      // ── session_start ──────────────────────────────────────────────────────
      api.on("session_start", (event, hookCtx) => {
        if (!enabled) return;
        sessionMap.set(hookCtx.agentId ?? event.sessionId, event.sessionId);
        enqueue({
          session_id: event.sessionId,
          agent_id: hookCtx.agentId,
          timestamp: now(),
          type: "session_start",
          status: "ok",
        });
      });

      // ── session_end ────────────────────────────────────────────────────────
      api.on("session_end", (event, hookCtx) => {
        if (!enabled) return;
        sessionMap.delete(hookCtx.agentId ?? event.sessionId);
        enqueue({
          session_id: event.sessionId,
          agent_id: hookCtx.agentId,
          timestamp: now(),
          type: "session_end",
          duration_ms: event.durationMs,
          status: "ok",
        });
      });

      // ── message_received ───────────────────────────────────────────────────
      // Inbound messages: who sent, which channel, content length + preview
      api.on("message_received", (event, hookCtx) => {
        if (!enabled) return;
        const sessionId = hookCtx.conversationId ?? hookCtx.channelId ?? "unknown";
        // Record arrival time for response-time tracking
        agentTurnStartMap.set(sessionId, Date.now());
        enqueue({
          session_id: sessionId,
          timestamp: now(),
          type: "message_received",
          status: "ok",
          metadata: {
            channel: hookCtx.channelId,
            from: event.from,
            content_length: typeof event.content === "string" ? event.content.length : 0,
            content_preview: typeof event.content === "string" ? event.content.slice(0, 120) : null,
            sender_id: (event.metadata as any)?.senderId ?? null,
            sender_name: (event.metadata as any)?.senderName ?? null,
            provider: (event.metadata as any)?.provider ?? null,
            is_group: Boolean((event.metadata as any)?.guildId || (event.metadata as any)?.channelName),
            message_id: (event.metadata as any)?.messageId ?? null,
          },
        });
      });

      // ── message_sent ───────────────────────────────────────────────────────
      // Enriched: content preview, channel, response time end-to-end
      api.on("message_sent", (event, hookCtx) => {
        if (!enabled) return;
        const sessionId = hookCtx.conversationId ?? hookCtx.channelId ?? "unknown";
        const startedAt = agentTurnStartMap.get(sessionId);
        const responseDurationMs = startedAt ? Date.now() - startedAt : undefined;
        if (startedAt) agentTurnStartMap.delete(sessionId);

        enqueue({
          session_id: sessionId,
          timestamp: now(),
          type: "message_sent",
          status: event.success ? "ok" : "error",
          error: event.error,
          duration_ms: responseDurationMs,
          metadata: {
            channel: hookCtx.channelId,
            to: event.to,
            content_length: typeof event.content === "string" ? event.content.length : 0,
            content_preview: typeof event.content === "string" ? event.content.slice(0, 120) : null,
            response_time_ms: responseDurationMs ?? null,
          },
        });
      });

      // ── before_agent_start ─────────────────────────────────────────────────
      // Captures agent turn kick-off: prompt preview + model
      api.on("before_agent_start", (event, hookCtx) => {
        if (!enabled) return;
        const sessionId = sessionMap.get(hookCtx.agentId ?? "") ?? hookCtx.sessionKey ?? "unknown";
        // Detect cron-triggered runs by trigger field or sessionKey pattern
        const isCron =
          hookCtx.trigger === "cron" ||
          (typeof hookCtx.sessionKey === "string" && hookCtx.sessionKey.includes(":cron:"));
        const eventType = isCron ? "cron_run" : "agent_start";
        enqueue({
          session_id: sessionId,
          agent_id: hookCtx.agentId,
          model: hookCtx.model,
          timestamp: now(),
          type: eventType,
          status: "ok",
          metadata: {
            prompt_length: typeof event.prompt === "string" ? event.prompt.length : 0,
            prompt_preview: typeof event.prompt === "string" ? event.prompt.slice(0, 120) : null,
            messages_count: Array.isArray(event.messages) ? event.messages.length : null,
            trigger: hookCtx.trigger ?? (isCron ? "cron" : "user"),
          },
        });
      });

      // ── before_tool_call ──────────────────────────────────────────────────
      // Track start time so after_tool_call can report think time
      api.on("before_tool_call", (event, hookCtx) => {
        if (!enabled) return;
        const key = event.toolCallId ?? event.runId ?? `${hookCtx.agentId}:${event.toolName}:${Date.now()}`;
        toolCallStartMap.set(key, Date.now());
      });

      // ── after_tool_call ───────────────────────────────────────────────────
      api.on("after_tool_call", (event, hookCtx) => {
        if (!enabled) return;

        const sessionId = sessionMap.get(hookCtx.agentId ?? "") ?? hookCtx.sessionKey ?? "unknown";
        const isSpawn   = event.toolName === "sessions_spawn";
        const result    = event.result as Record<string, unknown> | null | undefined;
        const params    = event.params as Record<string, unknown> | null | undefined;

        if (isSpawn) {
          enqueue({
            session_id: sessionId,
            agent_id: hookCtx.agentId,
            timestamp: now(),
            type: "agent_spawn",
            tool_name: "sessions_spawn",
            sub_agent_id: (
              (result?.details as any)?.childSessionKey ??
              result?.childSessionKey ??
              result?.sessionKey ??
              result?.sessionId ??
              null
            ) as string | undefined,
            input: params,
            output: result,
            duration_ms: event.durationMs,
            status: event.error ? "error" : "ok",
            error: event.error,
            metadata: {
              task:    typeof params?.task === "string"    ? params.task.slice(0, 400) : null,
              mode:    typeof params?.mode === "string"    ? params.mode               : null,
              runtime: typeof params?.runtime === "string" ? params.runtime           : null,
              model:   typeof params?.model === "string"   ? params.model             : null,
              label:   typeof params?.label === "string"   ? params.label             : null,
            },
          });
        } else {
          enqueue({
            session_id: sessionId,
            agent_id: hookCtx.agentId,
            timestamp: now(),
            type: "tool_call",
            tool_name: event.toolName,
            input: event.params,
            output: event.result,
            duration_ms: event.durationMs,
            status: event.error ? "error" : "ok",
            error: event.error,
          });
        }
      });

      // ── agent_end ─────────────────────────────────────────────────────────
      // Always emit (not just on error) so we can track full turn duration
      api.on("agent_end", (event, hookCtx) => {
        if (!enabled) return;
        const sessionId = hookCtx.sessionId ?? hookCtx.sessionKey ?? sessionMap.get(hookCtx.agentId ?? "") ?? "unknown";
        enqueue({
          session_id: sessionId,
          agent_id: hookCtx.agentId,
          timestamp: now(),
          type: "agent_end",
          duration_ms: event.durationMs,
          status: event.success ? "ok" : "error",
          error: event.error ?? (event.success ? undefined : "agent run failed"),
          metadata: {
            success: event.success,
          },
        });
      });

      // ── subagent_spawning ──────────────────────────────────────────────────
      api.on("subagent_spawning", (event, hookCtx) => {
        if (!enabled) return;
        const sessionId = sessionMap.get(hookCtx.agentId ?? "") ?? hookCtx.sessionKey ?? "unknown";
        enqueue({
          session_id: sessionId,
          agent_id: hookCtx.agentId,
          timestamp: now(),
          type: "subagent_spawning",
          status: "ok",
          metadata: {
            target_session_key: event.targetSessionKey,
            kind: event.kind,
            label: event.label ?? null,
            runtime: (event as any).runtime ?? null,
            model: (event as any).model ?? null,
          },
        });
      });

      // ── subagent_ended ────────────────────────────────────────────────────
      api.on("subagent_ended", (event, hookCtx) => {
        if (!enabled) return;
        const sessionId = sessionMap.get(hookCtx.agentId ?? "") ?? hookCtx.sessionKey ?? "unknown";
        enqueue({
          session_id: sessionId,
          agent_id: hookCtx.agentId,
          timestamp: now(),
          type: "subagent_ended",
          status: event.outcome === "ok" ? "ok" : "error",
          error: event.error,
          metadata: {
            target_session_key: event.targetSessionKey,
            outcome: event.outcome ?? "unknown",
            reason: event.reason,
            ended_at: event.endedAt ?? null,
          },
        });
      });

      // ── llm_output ────────────────────────────────────────────────────────
      api.on("llm_output", (event, hookCtx) => {
        if (!enabled) return;

        const MODEL_PRICING: Record<string, [number, number]> = {
          "opus":   [15,  75],
          "sonnet": [3,   15],
          "haiku":  [0.8,  4],
        };
        const modelLower = (event.model ?? "").toLowerCase();
        const tier = Object.keys(MODEL_PRICING).find(k => modelLower.includes(k));
        const [inPrice, outPrice] = tier ? MODEL_PRICING[tier] : [3, 15];
        const inTok  = event.usage?.input  ?? 0;
        const outTok = event.usage?.output ?? 0;
        const costUsd = (inTok * inPrice + outTok * outPrice) / 1_000_000;

        enqueue({
          session_id: event.sessionId,
          session_key: hookCtx.sessionKey,
          agent_id: hookCtx.agentId,
          model: event.model,
          timestamp: now(),
          type: "llm_output",
          tool_name: "llm_call",
          input_tokens: inTok,
          output_tokens: outTok,
          cache_tokens: event.usage?.cacheRead,
          status: "ok",
          metadata: {
            cost_usd: costUsd > 0 ? +costUsd.toFixed(6) : null,
            cache_write_tokens: event.usage?.cacheWrite ?? null,
          },
        });
      });

      // ── diagnostic events (richer model.usage) ────────────────────────────
      unsubscribeDiagnostics = onDiagnosticEvent((evt: DiagnosticEventPayload) => {
        try {
          if (evt.type === "model.usage") {
            enqueue({
              session_id: evt.sessionId ?? evt.sessionKey ?? "unknown",
              session_key: evt.sessionKey,
              model: evt.model,
              timestamp: now(),
              type: "model_usage",
              input_tokens: evt.usage.input,
              output_tokens: evt.usage.output,
              cache_tokens: evt.usage.cacheRead,
              duration_ms: evt.durationMs,
              status: "ok",
              metadata: {
                provider: evt.provider,
                channel: evt.channel,
                cost_usd: evt.costUsd,
                cache_write_tokens: evt.usage.cacheWrite,
                prompt_tokens: evt.usage.promptTokens,
                total_tokens: evt.usage.total,
                context_limit: evt.context?.limit,
                context_used: evt.context?.used,
              },
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger?.warn(`argus-export: diagnostic event handler error: ${message}`);
        }
      });

      // ── Periodic flush ────────────────────────────────────────────────────
      flushTimer = setInterval(() => {
        try { flush(); } catch { /* guard */ }
      }, config.flushIntervalMs);

      if (flushTimer && typeof flushTimer === "object" && "unref" in flushTimer) {
        (flushTimer as any).unref();
      }

      logger.info(
        `argus-export: telemetry export enabled (url=${config.argusUrl}, batch=${config.batchSize}, interval=${config.flushIntervalMs}ms)`,
      );
    },

    async stop() {
      enabled = false;

      if (unsubscribeDiagnostics) {
        unsubscribeDiagnostics();
        unsubscribeDiagnostics = null;
      }

      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }

      if (config && buffer.size > 0) {
        const events = buffer.drain();
        const url = `${config.argusUrl}/api/ingest`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        };
        try {
          await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(events),
            signal: AbortSignal.timeout(5_000),
          });
        } catch { /* silently drop on shutdown */ }
      }

      config = null;
      logger = null;
    },
  } satisfies OpenClawPluginService;
}
