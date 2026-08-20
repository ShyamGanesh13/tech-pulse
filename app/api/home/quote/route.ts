import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai';

export const dynamic = 'force-dynamic';

interface CacheEntry {
  date: string;
  quote: string;
  author: string;
}

let cache: CacheEntry | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseQuote(text: string): { quote: string; author: string } | null {
  // Match: "Quote text" — Author or "Quote text" - Author
  const quotedMatch = text.match(/^[""](.+?)[""][\s]*[—\-][\s]*(.+)$/);
  if (quotedMatch) {
    return { quote: quotedMatch[1].trim(), author: quotedMatch[2].trim() };
  }
  // Match: plain text — Author
  const plainMatch = text.match(/^(.+?)[—\-][\s]*(.+)$/);
  if (plainMatch) {
    return { quote: plainMatch[1].trim(), author: plainMatch[2].trim() };
  }
  return null;
}

export async function GET() {
  const dateKey = today();

  if (cache && cache.date === dateKey) {
    return Response.json({ quote: cache.quote, author: cache.author, ai: true });
  }

  if (!platformAIConfigured()) {
    return Response.json({ quote: null, author: null });
  }

  try {
    const content = await platformAIChat({
      messages: [
        {
          role: 'system',
          content:
            'You are a quote generator. Output only a single inspirational quote followed by a dash and the author name. Format: "Quote text" — Author Name. No preamble, no explanation.',
        },
        {
          role: 'user',
          content:
            'Generate an original inspirational quote about focus, creativity, or building things. Make it feel genuine, not clichéd.',
        },
      ],
    });

    const parsed = parseQuote(content.trim());

    if (!parsed) {
      return Response.json({ quote: null, author: null });
    }

    cache = { date: dateKey, quote: parsed.quote, author: parsed.author };
    return Response.json({ quote: parsed.quote, author: parsed.author, ai: true });
  } catch {
    return Response.json({ quote: null, author: null });
  }
}
