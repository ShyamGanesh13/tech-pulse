export const dynamic = 'force-dynamic';

const OLLAMA_HOST = process.env.OLLAMA_HOST;
const MODEL = process.env.OLLAMA_CLASSIFY_MODEL ?? 'qwen3:8b';

const SYSTEM_PROMPT =
  'You are a helpful personal assistant integrated into a productivity dashboard called TechPulse. You help with notes, reminders, tech news, finance questions, and general queries. Be concise and friendly.';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages?: ChatMessage[];
  message: string;
}

export async function POST(req: Request) {
  if (!OLLAMA_HOST) {
    return Response.json({
      reply: 'AI not configured — connect to Ollama to use chat.',
    });
  }

  try {
    const body: RequestBody = await req.json();

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...(body.messages ?? []),
      { role: 'user' as const, content: body.message },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let response: globalThis.Response;
    try {
      response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          stream: false,
          think: false,
          messages,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return Response.json({ reply: 'Something went wrong — try again.' });
    }

    const data = await response.json();
    const reply: string = data?.message?.content ?? '';

    return Response.json({ reply: reply.trim() });
  } catch {
    return Response.json({ reply: 'Something went wrong — try again.' });
  }
}
