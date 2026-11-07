// Server-only OpenRouter client (OpenAI-compatible chat completions with JSON output). Never import from client code.
import "server-only";
import { z } from "zod";

export const MODEL_FAST = process.env.OPENROUTER_MODEL_FAST || "anthropic/claude-haiku-5.5";
export const MODEL_SMART = process.env.OPENROUTER_MODEL_SMART || "anthropic/claude-sonnet-4.5";

export interface ChatJSONOptions { model?: string; timeoutMs?: number; maxTokens?: number; retry?: boolean; temperature?: number }

const memo = new Map<string, unknown>();

/** One chat completion that must return JSON matching `schema`. One retry on failure. Throws on final failure. */
export async function chatJSON<T>(schema: z.ZodType<T>, system: string, user: string, opts: ChatJSONOptions = {}): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const model = opts.model ?? MODEL_FAST;
  const cacheKey = JSON.stringify([model, system, user]);
  if (memo.has(cacheKey)) return memo.get(cacheKey) as T;
  const attempts = opts.retry === false ? 1 : 2;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://rushrehearsal.app", "X-Title": "Rush Rehearsal" },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system + "\nRespond with a single JSON object and nothing else." },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      const text: string = j.choices?.[0]?.message?.content ?? "";
      const parsed = schema.parse(JSON.parse(extractJSON(text)));
      memo.set(cacheKey, parsed);
      return parsed;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function extractJSON(text: string): string {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return t;
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (m) return m[1].trim();
  const i = t.indexOf("{"), k = t.lastIndexOf("}");
  return i >= 0 && k > i ? t.slice(i, k + 1) : t;
}
