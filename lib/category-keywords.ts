/**
 * The keyword table behind categorisation, and the pure match over it.
 *
 * A leaf module with no imports, because this had been copy-pasted into six
 * places that then drifted: both parse routes, lib/db.ts's autoCategory, a
 * client-side copy in the Selvam page for CSV imports, and two stale exported
 * category lists nothing read. The same description could get a different
 * category depending purely on which path it entered through.
 *
 * Anything needing the LLM fallback as well wants categorise() instead; this
 * stays dependency-free so the browser can use it for client-parsed CSVs.
 */
const CAT_KW: [string, string[]][] = [
  ['Food & Dining',  ['swiggy','zomato','dominos','mcdonald','pizza','restaurant','cafe','blinkit','dunzo','zepto','bigbasket','kfc','burger','subway','jaya siva','food','supermarket','groceries','instamart','hotel','bakery','coffee','palkova','anan']],
  ['Transport',      ['ola','uber','rapido','metro','irctc','redbus','makemytrip','fuel','petrol','diesel','bounce','yulu','flight','cab','bus','trip expen','travel','trip','railway','train','state tran']],
  ['Shopping',       ['amazon','flipkart','myntra','ajio','nykaa','meesho','snapdeal','reliance','croma','decathlon','trends','max retail','marina mal','retailz']],
  ['Utilities',      ['airtel','bharti','jio','bsnl','vodafone','electricity','electricit','bescom','water','gas bill','gas','recharge','dth','internet','broadband','wifi','wi-fi','bill pay','bill payment','payment fr']],
  ['Entertainment',  ['netflix','spotify','amazon prime','prime video','hotstar','disney','bookmyshow','pvr','inox','zee5','gaana','steam']],
  ['Healthcare',     ['pharmacy','hospital','hospit','clinic','doctor','apollo','medplus','pharmeasy','1mg','netmeds','chemist','medical','barber']],
  ['Home Rent',      ['rent','house rent','home rent','pg rent','accommodation','room rent','monthly rent','may rent','apr rent','april rent','march rent','june rent','july rent']],
  ['Finance',        ['insurance','emi','loan','sip','mutual fund','mutual fun','policy','premium','lic of india','lic','ppf','fixed deposit','invest','groww','zerodha','credit card','cc bill','cc billpay','ach','cams','hdfc limit']],
  ['Education',      ['course','udemy','coursera','byju','unacademy','vedantu','upgrad','tuition','books','school','college','fees','vidya']],
  ['Transfers',      ['transfer','neft','imps','rtgs','atm withdrawal','cash wdl','atm','self','mmt']],
]

/** Keyword verdict for a blob of text, or null when nothing matches. */
export function keywordCategory(text: string): string | null {
  const low = text.toLowerCase()
  for (const [cat, kws] of CAT_KW) if (kws.some(k => low.includes(k))) return cat
  return null
}

