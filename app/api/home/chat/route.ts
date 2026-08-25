import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT =
  'You are a helpful personal assistant integrated into a productivity dashboard called THUNAI. You help with notes, ninaivu (reminders), tech news, finance questions, and general queries. Be concise and friendly.';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages?: ChatMessage[];
  message: string;
}

export async function POST(req: Request) {
  if (!platformAIConfigured()) {
    return Response.json({
      reply: 'AI not configured — connect PlatformAI to use chat.',
    });
  }

  try {
    const body: RequestBody = await req.json();

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...(body.messages ?? []),
      { role: 'user' as const, content: body.message },
    ];

    const reply = await platformAIChat({ messages });
    return Response.json({ reply: reply.trim() });
  } catch {
    return Response.json({ reply: 'Something went wrong — try again.' });
  }
}
