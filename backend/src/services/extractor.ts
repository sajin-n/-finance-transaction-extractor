export function extractTransaction(text: string) {
  const dateMatch =
    text.match(/\d{4}-\d{2}-\d{2}/) ||
    text.match(/\d{2}\/\d{2}\/\d{4}/) ||
    text.match(/\d{2} Dec \d{4}/);

  const amountMatch = text.match(/₹?\s?([\d,]+\.\d{2})/);
  const balanceMatch = text.match(/Bal(?:ance)?\s?([\d,.]+)/i);

  return {
    date: new Date(dateMatch?.[0] ?? Date.now()),
    description: text.replace(/\n/g, " ").slice(0, 120),
    amount: amountMatch ? Number(amountMatch[1].replace(",", "")) : 0,
    balance: balanceMatch
      ? Number(balanceMatch[1].replace(",", ""))
      : null
  };
}

