export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getTransactions, getTransactionSummary, getMonthlyTotals } from '@/lib/data';
import { getUserIdOrNull, unauthorized } from '@/lib/auth';
import { platformAIChat, platformAIConfigured } from '@/lib/platform-ai';

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrNull()
  if (!userId) return unauthorized()

  if (!platformAIConfigured()) {
    return NextResponse.json({ answer: 'AI not configured.' });
  }

  let question: string;
  let month: string;

  try {
    const body = await req.json();
    question = body.question ?? '';
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    month = body.month ?? defaultMonth;
  } catch {
    return NextResponse.json({ answer: "Sorry, couldn't process that question." });
  }

  if (!question.trim()) {
    return NextResponse.json({ answer: "Sorry, couldn't process that question." });
  }

  try {
    const [transactions, summary, monthlyTotals] = await Promise.all([
      getTransactions(userId, { month }),
      getTransactionSummary(userId, month),
      getMonthlyTotals(userId, 6),
    ]);

    // Monthly summary block
    const net = summary.credit - summary.debit;
    const summaryLines = [
      `Month: ${month}`,
      `Income: ₹${summary.credit.toFixed(2)}`,
      `Expenses: ₹${summary.debit.toFixed(2)}`,
      `Net: ₹${net.toFixed(2)}`,
      `Transactions: ${summary.count}`,
    ];

    // Category breakdown
    const categoryLines = summary.by_category
      .sort((a, b) => b.amount - a.amount)
      .map(c => `  ${c.category}: ₹${c.amount.toFixed(2)}`);

    // Last 6 months trend
    const trendLines = monthlyTotals.map(
      m => `  ${m.month}: income ₹${m.credit.toFixed(2)}, expenses ₹${m.debit.toFixed(2)}`
    );

    // Top 15 transactions
    const top15 = transactions.slice(0, 15).map(
      t => `  [${t.date}] ${t.description} | ₹${t.amount.toFixed(2)} | ${t.type} | ${t.category}`
    );

    const context = [
      '=== Monthly Summary ===',
      summaryLines.join('\n'),
      '',
      '=== Category Breakdown ===',
      categoryLines.join('\n') || '  (none)',
      '',
      '=== Last 6 Months Trend ===',
      trendLines.join('\n') || '  (none)',
      '',
      '=== Top 15 Transactions ===',
      top15.join('\n') || '  (none)',
    ].join('\n');

    const systemPrompt =
      'You are a personal finance assistant. Answer questions about the user\'s finances using only the data provided. Be concise and specific. Use ₹ for amounts. If the data doesn\'t contain enough info to answer, say so briefly.';

    const userMessage = `Question: ${question}\n\n${context}`;

    let answer: string;
    try {
      answer = await platformAIChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });
    } catch {
      return NextResponse.json({ answer: "Sorry, couldn't process that question." });
    }

    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ answer: "Sorry, couldn't process that question." });
  }
}
