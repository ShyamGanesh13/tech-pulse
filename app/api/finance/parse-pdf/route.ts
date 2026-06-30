import { NextRequest, NextResponse } from 'next/server'

// Month abbreviation → zero-padded number
const MON: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
}

const CAT_KW: [string, string[]][] = [
  ['Food & Dining',  ['swiggy','zomato','dominos','mcdonald','pizza','restaurant','cafe','blinkit','dunzo','zepto','bigbasket','kfc','burger','subway','jaya siva','food','supermarket']],
  ['Transport',      ['ola','uber','rapido','metro','irctc','redbus','makemytrip','fuel','petrol','diesel','bounce','yulu','flight','cab','bus']],
  ['Shopping',       ['amazon','flipkart','myntra','ajio','nykaa','meesho','snapdeal','reliance','croma','decathlon','flipkart']],
  ['Utilities',      ['airtel','jio','bsnl','vodafone','electricity','bescom','water','gas','recharge','dth','internet','broadband']],
  ['Entertainment',  ['netflix','spotify','amazon prime','hotstar','disney','bookmyshow','pvr','inox','zee5','gaana','steam']],
  ['Healthcare',     ['pharmacy','hospital','clinic','doctor','apollo','medplus','pharmeasy','1mg','netmeds','chemist','medical']],
  ['Finance',        ['insurance','emi','loan','sip','mutual fund','policy','premium','lic','ppf','fixed deposit']],
  ['Education',      ['course','udemy','coursera','byju','unacademy','vedantu','upgrad','tuition','books']],
  ['Transfers',      ['transfer','neft','imps','rtgs','cashback','refund']],
]

function autocat(desc: string): string {
  const low = desc.toLowerCase()
  for (const [cat, kw] of CAT_KW) if (kw.some(k => low.includes(k))) return cat
  return 'Other'
}

function parseDate(raw: string): string {
  // "01 Dec, 2025" → "2025-12-01"
  const m = raw.match(/(\d{1,2})\s+(\w{3}),?\s+(\d{4})/)
  if (!m) return ''
  const mon = MON[m[2].toLowerCase()] ?? '01'
  return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/[₹,\s]/g, '')) || 0
}

interface TxRow {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category: string
  source: string
}

function parseGPayText(text: string): TxRow[] {
  const results: TxRow[] = []

  // The GPay PDF, when read left-to-right top-to-bottom, produces text like:
  // "01 Dec, 2025 Paid to IRCTC Web UPI ₹167.25 11:06 AM UPI Transaction ID: 570143811839 Paid by ICICI Bank 5410"
  // We use UPI Transaction ID as a reliable transaction delimiter.

  // Split into transaction blocks using UPI ID as the anchor
  const blocks = text.split(/UPI Transaction ID:\s*\d+/)

  for (const block of blocks) {
    // Find date: "DD Mon, YYYY"
    const dateMatch = block.match(/\b(\d{1,2}\s+\w{3},?\s+\d{4})\b/)
    if (!dateMatch) continue
    const date = parseDate(dateMatch[1])
    if (!date) continue

    // Find transaction type and merchant
    // "Paid to X" (debit) or "Received from X" (credit)
    // Exclude "Paid by ICICI Bank" and "Paid to ICICI Bank" (bank settlement lines)
    const txMatch = block.match(/(Paid to|Received from)\s+((?:(?!ICICI Bank|\d{4}\s*$).)+?)(?=\s*₹|\s*\d{1,2}:\d{2}|\s*$)/i)
    if (!txMatch) continue

    const typeWord = txMatch[1].toLowerCase()
    const description = txMatch[2].trim().replace(/\s+/g, ' ')

    // Skip bank reference lines like "ICICI Bank 5410"
    if (/icici\s*bank/i.test(description)) continue
    // Skip very short or obviously wrong matches
    if (description.length < 2) continue

    const type: 'debit' | 'credit' = typeWord === 'received from' ? 'credit' : 'debit'

    // Find amount: ₹XXXX or ₹XX,XXX.XX
    const amtMatch = block.match(/₹\s*([\d,]+(?:\.\d{1,2})?)/)
    if (!amtMatch) continue
    const amount = parseAmount(amtMatch[1])
    if (amount <= 0) continue

    results.push({
      date,
      description,
      amount,
      type,
      category: autocat(description),
      source: 'gpay',
    })
  }

  return results
}

async function extractPDFText(buffer: Buffer): Promise<string> {
  // Dynamic import for Node.js — pdfjs-dist v6+ uses ESM (.mjs)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  let fullText = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = (content.items as Array<{ str: string }>)
      .map(item => item.str)
      .join(' ')
    fullText += pageText + ' '
  }

  return fullText
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractPDFText(buffer)
    const transactions = parseGPayText(text)

    if (transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found — is this a GPay PDF statement?' }, { status: 422 })
    }

    return NextResponse.json({ transactions, total: transactions.length })
  } catch (err) {
    console.error('PDF parse error:', err)
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 })
  }
}
