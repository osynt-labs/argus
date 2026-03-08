/**
 * tool-analyzer.ts
 *
 * Smart classification engine for tool-call events.
 * Provides:
 *  - Deep categorization of every tool (exec subcommands, git, k8s, etc.)
 *  - Risk scoring (low / medium / high / critical)
 *  - Plain-secret detection with field attribution and masking
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface SecretMatch {
  type: string;       // e.g. "github_token", "mongodb_uri", "password"
  label: string;      // human-friendly label
  field: string;      // where it was found: "command", "url", "input.password", …
  masked: string;     // first 6 chars + "****"
  severity: RiskLevel;
}

export interface ToolAnalysis {
  /** Top-level category: git | exec | file | web | k8s | docker | network | ssh | db | package | browser | message | cron | agent | media | other */
  category: string;
  /** Dotted sub-category: git.push | exec.rm | k8s.apply | … */
  subCategory: string;
  /** Emoji icon for the category */
  icon: string;
  /** Short human label: "git push", "kubectl apply", … */
  label: string;
  /** Extra extracted details: { repo, branch, target, url, … } */
  details: Record<string, string>;
  /** Overall risk */
  risk: RiskLevel;
  /** Detected plaintext secrets (empty when none) */
  secrets: SecretMatch[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Secret detection patterns
// ─────────────────────────────────────────────────────────────────────────────

interface SecretPattern {
  type: string;
  label: string;
  regex: RegExp;
  severity: RiskLevel;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  { type: "aws_access_key",    label: "AWS Access Key",          regex: /\bAKIA[0-9A-Z]{16}\b/,                                                      severity: "critical" },
  { type: "aws_secret_key",    label: "AWS Secret Key",          regex: /(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)\s*[:=]\s*['"]?([A-Za-z0-9/+]{40})/i, severity: "critical" },

  // GitHub / GitLab
  { type: "github_token",      label: "GitHub Token",            regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/,                                           severity: "critical" },
  { type: "gitlab_token",      label: "GitLab Token",            regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/,                                             severity: "critical" },

  // JWT
  { type: "jwt",               label: "JWT Token",               regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,        severity: "high" },

  // Private Keys
  { type: "private_key",       label: "Private Key",             regex: /-----BEGIN\s(?:[A-Z ]{0,30})?PRIVATE KEY-----/,                             severity: "critical" },

  // Database URIs with embedded credentials
  { type: "mongodb_uri",       label: "MongoDB URI (with creds)", regex: /mongodb(?:\+srv)?:\/\/[^:@\s]+:[^@\s]+@/i,                                 severity: "critical" },
  { type: "postgres_uri",      label: "PostgreSQL URI (with creds)", regex: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@/i,                               severity: "critical" },
  { type: "mysql_uri",         label: "MySQL URI (with creds)",   regex: /mysql:\/\/[^:@\s]+:[^@\s]+@/i,                                            severity: "critical" },
  { type: "redis_uri",         label: "Redis URI (with creds)",   regex: /redis:\/\/:[^@\s]+@/i,                                                    severity: "high" },

  // Generic high-confidence credential patterns
  { type: "bearer_token",      label: "Bearer Token",            regex: /\bbearer\s+[A-Za-z0-9_\-.]{20,}\b/i,                                       severity: "high" },
  { type: "basic_auth",        label: "Basic Auth Header",       regex: /Authorization:\s*Basic\s+[A-Za-z0-9+/=]{8,}/i,                             severity: "high" },

  // Key=value patterns in env/config files
  { type: "password_kv",       label: "Password (key=value)",    regex: /\b(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"#]{8,})/i,                  severity: "high" },
  { type: "secret_kv",         label: "Secret (key=value)",      regex: /\b(?:secret|client_secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-.]{16,})/i,        severity: "high" },
  { type: "api_key_kv",        label: "API Key (key=value)",     regex: /\b(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-.]{16,})/i, severity: "high" },
  { type: "token_kv",          label: "Token (key=value)",       regex: /\b(?:access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?([A-Za-z0-9_\-.]{20,})/i, severity: "high" },

  // Specific service patterns
  { type: "slack_token",       label: "Slack Token",             regex: /\bxox[bposa]-[A-Za-z0-9-]{10,}\b/,                                         severity: "critical" },
  { type: "stripe_key",        label: "Stripe Key",              regex: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}\b/,                             severity: "critical" },
  { type: "sendgrid_key",      label: "SendGrid API Key",        regex: /\bSG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}\b/,                          severity: "critical" },
  { type: "twilio_token",      label: "Twilio Token",            regex: /\bSK[a-f0-9]{32}\b/,                                                       severity: "critical" },

  // GCP / Firebase
  { type: "gcp_service_account", label: "GCP Service Account Key", regex: /"type"\s*:\s*"service_account"/,                                         severity: "critical" },

  // Generic long hex/base64 that look like secrets (lower confidence)
  { type: "hex_secret",        label: "Hex Secret (suspected)",  regex: /\b[0-9a-f]{40,64}\b/,                                                      severity: "medium" },
];

/**
 * Scan a string for secrets. Returns array of matches.
 */
function detectSecrets(text: string, field: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  const seen = new Set<string>();

  for (const pat of SECRET_PATTERNS) {
    const m = pat.regex.exec(text);
    if (!m) continue;

    const raw = m[0];
    const key = `${pat.type}:${raw.slice(0, 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const masked = raw.length > 10
      ? raw.slice(0, 6) + "****"
      : raw.slice(0, 3) + "***";

    found.push({ type: pat.type, label: pat.label, field, masked, severity: pat.severity });
  }
  return found;
}

/**
 * Recursively scan any value (string, object, array) for secrets.
 */
function scanValue(value: unknown, path: string, out: SecretMatch[]) {
  if (typeof value === "string") {
    out.push(...detectSecrets(value, path));
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanValue(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      scanValue(v, path ? `${path}.${k}` : k, out);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Command classifiers
// ─────────────────────────────────────────────────────────────────────────────

interface CmdClassification {
  category: string;
  subCategory: string;
  icon: string;
  label: string;
  details: Record<string, string>;
  risk: RiskLevel;
}

function classifyCommand(cmd: string): CmdClassification {
  const c = cmd.trim();

  // ── Git ─────────────────────────────────────────────────────────
  const gitMatch = c.match(/^git\s+(\S+)(.*)/);
  if (gitMatch) {
    const verb = gitMatch[1].toLowerCase();
    const rest = gitMatch[2].trim();

    const gitVerbs: Record<string, { icon: string; risk: RiskLevel }> = {
      push:     { icon: "⬆️",  risk: "high"   },
      "force-push": { icon: "🚨", risk: "critical" },
      pull:     { icon: "⬇️",  risk: "low"    },
      fetch:    { icon: "📥",  risk: "low"    },
      clone:    { icon: "📋",  risk: "low"    },
      commit:   { icon: "✅",  risk: "medium" },
      merge:    { icon: "🔀",  risk: "high"   },
      rebase:   { icon: "🔁",  risk: "high"   },
      reset:    { icon: "⏪",  risk: "high"   },
      checkout: { icon: "🔄",  risk: "medium" },
      switch:   { icon: "🔄",  risk: "medium" },
      branch:   { icon: "🌿",  risk: "low"    },
      status:   { icon: "👀",  risk: "low"    },
      log:      { icon: "📜",  risk: "low"    },
      diff:     { icon: "📊",  risk: "low"    },
      stash:    { icon: "📦",  risk: "low"    },
      tag:      { icon: "🏷️",  risk: "medium" },
      add:      { icon: "➕",  risk: "low"    },
      rm:       { icon: "🗑️",  risk: "medium" },
      restore:  { icon: "♻️",  risk: "medium" },
      cherry:   { icon: "🍒",  risk: "medium" },
      blame:    { icon: "🔍",  risk: "low"    },
      show:     { icon: "👁️",  risk: "low"    },
      config:   { icon: "⚙️",  risk: "medium" },
    };

    // detect force push
    const isForce = rest.includes("--force") || rest.includes("-f") || c.includes("push --force");
    const effectiveVerb = (verb === "push" && isForce) ? "force-push" : verb;
    const g = gitVerbs[effectiveVerb] ?? { icon: "🐙", risk: "medium" as RiskLevel };

    // Extract branch / remote
    const details: Record<string, string> = {};
    const remoteMatch = rest.match(/(?:origin|upstream|[a-z][a-z0-9_-]+)\s+([\w/.-]+)/);
    if (remoteMatch) details.branch = remoteMatch[1];
    const repoMatch = c.match(/github\.com[/:](.*)/);
    if (repoMatch) details.repo = repoMatch[1];

    return {
      category: "git",
      subCategory: `git.${effectiveVerb}`,
      icon: g.icon,
      label: `git ${effectiveVerb}${details.branch ? ` → ${details.branch}` : ""}`,
      details,
      risk: g.risk,
    };
  }

  // ── kubectl ──────────────────────────────────────────────────────
  const kubectlMatch = c.match(/^kubectl\s+(\S+)(?:\s+(\S+))?(.*)/);
  if (kubectlMatch) {
    const verb  = kubectlMatch[1].toLowerCase();
    const res   = kubectlMatch[2] ?? "";
    const rest2 = kubectlMatch[3].trim();

    const riskyVerbs = new Set(["delete","drain","cordon","taint","edit","patch","replace","apply","create","rollout"]);
    const ns = rest2.match(/-n\s+(\S+)|--namespace[= ](\S+)/)?.[1];

    return {
      category: "k8s",
      subCategory: `k8s.${verb}`,
      icon: "☸️",
      label: `kubectl ${verb}${res ? " " + res : ""}${ns ? ` (${ns})` : ""}`,
      details: { ...(ns ? { namespace: ns } : {}), ...(res ? { resource: res } : {}) },
      risk: riskyVerbs.has(verb) ? "high" : "low",
    };
  }

  // ── docker / docker-compose ──────────────────────────────────────
  const dockerMatch = c.match(/^docker(?:-compose)?\s+(\S+)(.*)/);
  if (dockerMatch) {
    const verb = dockerMatch[1].toLowerCase();
    const riskyDocker = new Set(["run","rm","rmi","push","exec","build","compose"]);
    return {
      category: "docker",
      subCategory: `docker.${verb}`,
      icon: "🐳",
      label: `docker ${verb}`,
      details: {},
      risk: riskyDocker.has(verb) ? "medium" : "low",
    };
  }

  // ── ssh / scp / rsync ────────────────────────────────────────────
  const sshMatch = c.match(/^(ssh|scp|rsync)\s+(.*)/);
  if (sshMatch) {
    const tool = sshMatch[1];
    const target = sshMatch[2].match(/(?:@|)([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1];
    return {
      category: "ssh",
      subCategory: `ssh.${tool}`,
      icon: "🔐",
      label: `${tool}${target ? ` → ${target}` : ""}`,
      details: target ? { host: target } : {},
      risk: "high",
    };
  }

  // ── curl / wget / httpie ─────────────────────────────────────────
  const httpMatch = c.match(/^(curl|wget|http)\s+(.*)/);
  if (httpMatch) {
    const tool = httpMatch[1];
    const urlMatch = httpMatch[2].match(/https?:\/\/[^\s'"]+/);
    const isPost = httpMatch[2].includes("-X POST") || httpMatch[2].includes("--data") || httpMatch[2].includes("-d ");
    const method = isPost ? "POST" : "GET";
    return {
      category: "network",
      subCategory: `network.${tool}`,
      icon: "🌐",
      label: `${tool} ${method}${urlMatch ? " " + new URL(urlMatch[0]).hostname : ""}`,
      details: urlMatch ? { url: urlMatch[0].slice(0, 80) } : {},
      risk: isPost ? "medium" : "low",
    };
  }

  // ── npm / yarn / pnpm / pip ──────────────────────────────────────
  const pkgMatch = c.match(/^(npm|yarn|pnpm|pip3?|cargo|go)\s+(\S+)(.*)/);
  if (pkgMatch) {
    const mgr = pkgMatch[1];
    const verb = pkgMatch[2].toLowerCase();
    const pubVerbs = new Set(["publish","push","release","deploy"]);
    return {
      category: "package",
      subCategory: `package.${mgr}.${verb}`,
      icon: "📦",
      label: `${mgr} ${verb}`,
      details: {},
      risk: pubVerbs.has(verb) ? "high" : "low",
    };
  }

  // ── psql / mysql / mongosh / redis-cli ──────────────────────────
  const dbMatch = c.match(/^(psql|mysql|mongosh?|mongo|redis-cli|sqlite3)\s*(.*)/);
  if (dbMatch) {
    return {
      category: "db",
      subCategory: `db.${dbMatch[1]}`,
      icon: "🗄️",
      label: dbMatch[1],
      details: {},
      risk: "high",
    };
  }

  // ── Destructive file ops ─────────────────────────────────────────
  const rmMatch = c.match(/^(rm|shred|truncate)\s+(.*)/);
  if (rmMatch) {
    const isRf = rmMatch[2].includes("-rf") || rmMatch[2].includes("-r");
    return {
      category: "exec",
      subCategory: "exec.rm",
      icon: "🗑️",
      label: isRf ? "rm -rf" : "rm",
      details: {},
      risk: isRf ? "critical" : "medium",
    };
  }

  // ── chmod / chown ─────────────────────────────────────────────────
  const chmodMatch = c.match(/^(chmod|chown)\s+(.*)/);
  if (chmodMatch) {
    return {
      category: "exec",
      subCategory: `exec.${chmodMatch[1]}`,
      icon: "🔑",
      label: chmodMatch[1],
      details: {},
      risk: "medium",
    };
  }

  // ── cat / head / tail / grep / find / ls ─────────────────────────
  const readMatch = c.match(/^(cat|head|tail|grep|find|ls|stat|wc|diff|less|more)\s+(.*)/);
  if (readMatch) {
    return {
      category: "exec",
      subCategory: `exec.${readMatch[1]}`,
      icon: "🔍",
      label: readMatch[1],
      details: {},
      risk: "low",
    };
  }

  // ── cp / mv / mkdir / touch ──────────────────────────────────────
  const fsMatch = c.match(/^(cp|mv|mkdir|touch|ln)\s+(.*)/);
  if (fsMatch) {
    return {
      category: "exec",
      subCategory: `exec.${fsMatch[1]}`,
      icon: "📁",
      label: fsMatch[1],
      details: {},
      risk: "low",
    };
  }

  // ── systemctl / service ──────────────────────────────────────────
  const svcMatch = c.match(/^(systemctl|service)\s+(\S+)\s+(\S+)(.*)/);
  if (svcMatch) {
    const action = svcMatch[2].toLowerCase();
    const name   = svcMatch[3];
    return {
      category: "exec",
      subCategory: "exec.service",
      icon: "⚙️",
      label: `${svcMatch[1]} ${action} ${name}`,
      details: { service: name, action },
      risk: action === "stop" || action === "kill" ? "high" : "medium",
    };
  }

  // ── python / node / bash / sh ────────────────────────────────────
  const scriptMatch = c.match(/^(python3?|node|bash|sh|zsh)\s+(.*)/);
  if (scriptMatch) {
    const script = scriptMatch[2].split(/\s/)[0];
    return {
      category: "exec",
      subCategory: `exec.${scriptMatch[1]}`,
      icon: "📜",
      label: `${scriptMatch[1]} ${script}`,
      details: { script },
      risk: "medium",
    };
  }

  // ── Generic fallback ─────────────────────────────────────────────
  const bin = c.split(/\s+/)[0] ?? "unknown";
  return {
    category: "exec",
    subCategory: `exec.${bin}`,
    icon: "💻",
    label: bin,
    details: {},
    risk: "low",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool-level classifiers
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_BASES: Record<string, { category: string; icon: string; baseRisk: RiskLevel }> = {
  read:           { category: "file",    icon: "📖", baseRisk: "low"    },
  write:          { category: "file",    icon: "📝", baseRisk: "medium" },
  edit:           { category: "file",    icon: "✏️", baseRisk: "medium" },
  web_search:     { category: "web",     icon: "🔍", baseRisk: "low"    },
  web_fetch:      { category: "web",     icon: "🔗", baseRisk: "low"    },
  browser:        { category: "browser", icon: "🌐", baseRisk: "medium" },
  message:        { category: "message", icon: "💬", baseRisk: "medium" },
  cron:           { category: "cron",    icon: "⏰", baseRisk: "medium" },
  sessions_spawn: { category: "agent",   icon: "🤖", baseRisk: "medium" },
  sessions_send:  { category: "agent",   icon: "📡", baseRisk: "low"    },
  sessions_list:  { category: "agent",   icon: "📋", baseRisk: "low"    },
  sessions_history: { category: "agent", icon: "📜", baseRisk: "low"    },
  subagents:      { category: "agent",   icon: "🤖", baseRisk: "low"    },
  image:          { category: "media",   icon: "🖼️", baseRisk: "low"    },
  pdf:            { category: "media",   icon: "📄", baseRisk: "low"    },
  tts:            { category: "media",   icon: "🔊", baseRisk: "low"    },
  canvas:         { category: "canvas",  icon: "🎨", baseRisk: "low"    },
  process:        { category: "exec",    icon: "🔄", baseRisk: "medium" },
  memory_search:  { category: "memory",  icon: "🧠", baseRisk: "low"    },
  memory_get:     { category: "memory",  icon: "💭", baseRisk: "low"    },
  nodes:          { category: "infra",   icon: "📱", baseRisk: "medium" },
  gateway:        { category: "infra",   icon: "🚪", baseRisk: "high"   },
  session_status: { category: "agent",   icon: "📊", baseRisk: "low"    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze a tool call event and return a rich ToolAnalysis object.
 * @param toolName  The tool name from the event (e.g. "exec", "read", …)
 * @param input     The raw input payload (JSON-serializable)
 */
export function analyzeToolCall(
  toolName: string | null | undefined,
  input: unknown,
): ToolAnalysis {
  const tool = toolName ?? "unknown";

  // ── Scan all input fields for secrets ────────────────────────────
  const secrets: SecretMatch[] = [];
  scanValue(input, "input", secrets);

  const maxSecretRisk = secrets.reduce<RiskLevel>((acc, s) => {
    const order: RiskLevel[] = ["low", "medium", "high", "critical"];
    return order.indexOf(s.severity) > order.indexOf(acc) ? s.severity : acc;
  }, "low");

  // ── exec: deep command classification ────────────────────────────
  if (tool === "exec") {
    const cmd: string =
      (input as any)?.command ??
      (typeof input === "string" ? input : "");

    const cls = classifyCommand(cmd);
    const risk = elevate(cls.risk, maxSecretRisk);

    return { ...cls, secrets, risk };
  }

  // ── Non-exec tools ───────────────────────────────────────────────
  const base = TOOL_BASES[tool];
  if (base) {
    const details: Record<string, string> = {};
    let label = base.category;
    let subCategory = base.category;

    // Enrich per-tool
    if (tool === "read" || tool === "write" || tool === "edit") {
      const path = (input as any)?.path ?? (input as any)?.file_path ?? "";
      if (path) {
        details.path = path;
        label = `${tool} ${path.split("/").pop() ?? path}`;
      }
      subCategory = `file.${tool}`;
    } else if (tool === "web_fetch") {
      const url = (input as any)?.url ?? "";
      if (url) { try { details.host = new URL(url).hostname; label = `fetch ${details.host}`; } catch {} }
      subCategory = "web.fetch";
    } else if (tool === "web_search") {
      const q = (input as any)?.query ?? "";
      if (q) { details.query = q.slice(0, 50); label = `search "${details.query}"`; }
      subCategory = "web.search";
    } else if (tool === "browser") {
      const action = (input as any)?.action ?? "";
      const url    = (input as any)?.url ?? "";
      label = `browser.${action}`;
      subCategory = `browser.${action}`;
      if (url) { try { details.host = new URL(url).hostname; } catch {} }
    } else if (tool === "message") {
      const action = (input as any)?.action ?? "send";
      const target = (input as any)?.target ?? (input as any)?.to ?? "";
      label = `message.${action}${target ? ` → ${target}` : ""}`;
      subCategory = `message.${action}`;
    } else if (tool === "cron") {
      const action = (input as any)?.action ?? "add";
      label = `cron.${action}`;
      subCategory = `cron.${action}`;
    } else if (tool === "sessions_spawn") {
      const runtime = (input as any)?.runtime ?? "";
      const agentId = (input as any)?.agentId ?? "";
      label = `spawn${runtime ? " " + runtime : ""}${agentId ? ` (${agentId})` : ""}`;
      subCategory = "agent.spawn";
    } else if (tool === "gateway") {
      const action = (input as any)?.action ?? "";
      label = `gateway.${action}`;
      subCategory = `gateway.${action}`;
    }

    const risk = elevate(base.baseRisk, maxSecretRisk);
    return {
      category: base.category,
      subCategory,
      icon: base.icon,
      label,
      details,
      secrets,
      risk,
    };
  }

  // ── Fallback ─────────────────────────────────────────────────────
  return {
    category: "other",
    subCategory: `other.${tool}`,
    icon: "🔧",
    label: tool,
    details: {},
    secrets,
    risk: elevate("low", maxSecretRisk),
  };
}

/** Raise a risk level if secrets were found. */
function elevate(base: RiskLevel, fromSecrets: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  return order.indexOf(fromSecrets) > order.indexOf(base) ? fromSecrets : base;
}

/** Risk label for display */
export const RISK_META: Record<RiskLevel, { label: string; color: string; badge: string }> = {
  low:      { label: "Low",      color: "#22c55e", badge: "bg-green-500/20 text-green-300"   },
  medium:   { label: "Medium",   color: "#f59e0b", badge: "bg-yellow-500/20 text-yellow-300" },
  high:     { label: "High",     color: "#f97316", badge: "bg-orange-500/20 text-orange-300" },
  critical: { label: "Critical", color: "#ef4444", badge: "bg-red-500/20 text-red-400"       },
};
