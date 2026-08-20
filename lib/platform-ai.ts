// Shared PlatformAI (Zia) client — the one AI backend for this app. Replaces the
// old per-route Ollama fetches; OpenAI stays wired in a couple of places as an
// existing fallback, unrelated to this module.
//
// Auth is OAuth refresh-token → short-lived access token, minted at
// accounts.zoho.in and cached in memory for the process lifetime (Catalyst
// AppSail is a long-running Node process, so this survives across requests same
// as lib/db.ts's cached Turso client). A call that comes back with an
// INVALID_OAUTHTOKEN-shaped error triggers exactly one forced refresh + retry —
// never a mint on every request, since Zoho throttles refreshes to ~10/10min.

export type PlatformAIMessage = { role: string; content: string }

interface PlatformAIConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  portalId: string
  serviceOrgId: string
  service: string
  zuid: string
  tokenId?: string
}

const TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token'
const CHAT_ENDPOINT = process.env.PLATFORM_AI_ENDPOINT ?? 'https://platformai.zoho.in/v2/ai/zia/chat'
const CHAT_MODEL = process.env.PLATFORM_AI_MODEL ?? 'zlabs-qwen35-122B-v1'
const EMBED_ENDPOINT = process.env.PLATFORM_AI_EMBED_ENDPOINT ?? 'https://platformai.zoho.in/v2/ai/zia/embedding'
const EMBED_MODEL = process.env.PLATFORM_AI_EMBED_MODEL ?? 'bge-m3'

// Zoho access tokens last ~1h; refresh a bit early.
const TOKEN_TTL_MS = 50 * 60 * 1000
const REQUEST_TIMEOUT_MS = 120_000

function loadConfig(): PlatformAIConfig | null {
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  const portalId = process.env.PLATFORM_AI_PORTAL_ID
  const serviceOrgId = process.env.PLATFORM_AI_SERVICE_ORG_ID
  const service = process.env.PLATFORM_AI_SERVICE
  const zuid = process.env.PLATFORM_AI_ZUID
  if (!clientId || !clientSecret || !refreshToken || !portalId || !serviceOrgId || !service || !zuid) return null
  return { clientId, clientSecret, refreshToken, portalId, serviceOrgId, service, zuid, tokenId: process.env.PLATFORM_AI_TOKEN_ID }
}

export function platformAIConfigured(): boolean {
  return loadConfig() !== null
}

let cachedToken: string | null = null
let cachedAt = 0
let refreshing: Promise<string> | null = null

/** Test-only: clears the in-memory token cache so mocked token calls aren't skipped. */
export function _resetPlatformAITokenCacheForTests(): void {
  cachedToken = null
  cachedAt = 0
  refreshing = null
}

async function mintAccessToken(cfg: PlatformAIConfig): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  const accessToken = (data as { access_token?: string }).access_token
  if (!res.ok || !accessToken) {
    const err = (data as { error?: string }).error ?? res.status
    throw new Error(`platform-ai: token refresh failed (${err})`)
  }
  return accessToken
}

async function getAccessToken(cfg: PlatformAIConfig, force = false): Promise<string> {
  const now = Date.now()
  if (!force && cachedToken && now - cachedAt < TOKEN_TTL_MS) return cachedToken
  if (refreshing) return refreshing
  refreshing = mintAccessToken(cfg)
    .then(token => { cachedToken = token; cachedAt = Date.now(); return token })
    .finally(() => { refreshing = null })
  return refreshing
}

function authHeaders(cfg: PlatformAIConfig, token: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    service: cfg.service,
    portal_id: cfg.portalId,
    service_org_id: cfg.serviceOrgId,
    zuid: cfg.zuid,
    Authorization: `Zoho-oauthtoken ${token}`,
  }
  if (cfg.tokenId) headers.token_id = cfg.tokenId
  return headers
}

function isAuthError(status: number, json: unknown): boolean {
  if (status === 401 || status === 403) return true
  const message = (json as { error?: { message?: string; error_code?: number } })?.error
  const blob = `${message?.message ?? ''} ${message?.error_code ?? ''}`.toUpperCase()
  return blob.includes('OAUTHTOKEN') || blob.includes('UNAUTHORIZ')
}

async function postJSON(cfg: PlatformAIConfig, endpoint: string, body: unknown, token: string) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(cfg, token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

/** POSTs to a PlatformAI endpoint, refreshing the access token once on an auth error. */
async function callPlatformAI(endpoint: string, body: unknown): Promise<unknown> {
  const cfg = loadConfig()
  if (!cfg) throw new Error('platform-ai: not configured')

  let token = await getAccessToken(cfg)
  let { status, json } = await postJSON(cfg, endpoint, body, token)
  if (isAuthError(status, json)) {
    token = await getAccessToken(cfg, true)
    ;({ status, json } = await postJSON(cfg, endpoint, body, token))
  }
  if (status < 200 || status >= 300) {
    throw new Error(`platform-ai: request failed (${status}): ${JSON.stringify(json).slice(0, 300)}`)
  }
  return json
}

/** system-role messages become PlatformAI's single `context` string; the rest pass through. */
function toRequestBody(opts: { messages: PlatformAIMessage[]; model?: string }) {
  const context = opts.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const messages = opts.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
  return { context, messages, model: opts.model ?? CHAT_MODEL }
}

export async function platformAIChat(opts: { messages: PlatformAIMessage[]; model?: string }): Promise<string> {
  const json = await callPlatformAI(CHAT_ENDPOINT, toRequestBody(opts))
  const text = (json as { data?: { results?: unknown[] } })?.data?.results?.[0]
  if (typeof text !== 'string') throw new Error('platform-ai: unexpected chat response shape')
  return text
}

/**
 * Streams a chat completion over SSE, calling `onToken` for each incremental
 * piece. The final SSE event carries the whole message re-wrapped under a
 * `data` key (`{"data":{"is_final_chunk":true,"messages":[{"content":"<full text>"}]}}`)
 * — that full text is trusted as the return value over the piece-by-piece
 * concatenation, which is kept only for the token callback.
 */
export async function platformAIChatStream(
  opts: { messages: PlatformAIMessage[]; model?: string },
  onToken: (piece: string) => void,
): Promise<string> {
  const cfg = loadConfig()
  if (!cfg) throw new Error('platform-ai: not configured')
  const body = { ...toRequestBody(opts), stream: true }

  let token = await getAccessToken(cfg)
  let res = await fetch(CHAT_ENDPOINT, { method: 'POST', headers: authHeaders(cfg, token), body: JSON.stringify(body) })
  if (res.status === 401 || res.status === 403) {
    token = await getAccessToken(cfg, true)
    res = await fetch(CHAT_ENDPOINT, { method: 'POST', headers: authHeaders(cfg, token), body: JSON.stringify(body) })
  }
  if (!res.ok || !res.body) throw new Error(`platform-ai: stream request failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  let finalText: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const evt of events) {
      const dataLine = evt.split('\n').find(l => l.startsWith('data:'))
      if (!dataLine) continue
      let parsed: unknown
      try { parsed = JSON.parse(dataLine.slice(5).trim()) } catch { continue }
      const wrapped = (parsed as { data?: { messages?: { content?: string }[] } })?.data?.messages?.[0]?.content
      if (typeof wrapped === 'string') { finalText = wrapped; continue }
      const piece = (parsed as { messages?: { content?: string }[] })?.messages?.[0]?.content
      if (typeof piece === 'string' && piece.length > 0) {
        full += piece
        onToken(piece)
      }
    }
  }
  return finalText ?? full
}

export type EmbeddingTaskType = 'retrivial_document' | 'retrivial_query' | 'classification' | 'clustering' | 'semantic_similarity'

/** Empty texts, or PlatformAI not configured, both yield one empty vector per input — no error. */
export async function platformAIEmbed(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]> {
  if (texts.length === 0) return []
  if (!platformAIConfigured()) return texts.map(() => [])

  const json = await callPlatformAI(EMBED_ENDPOINT, {
    contents: texts,
    ai_vendor: 'zia',
    model: EMBED_MODEL,
    ...(taskType ? { task_type: taskType } : {}),
  })
  const results = (json as { data?: { results?: { embeddings?: unknown }[] } })?.data?.results
  if (!Array.isArray(results)) throw new Error('platform-ai: unexpected embedding response shape')
  return results.map(r => (Array.isArray(r.embeddings) ? (r.embeddings as number[]) : []))
}
