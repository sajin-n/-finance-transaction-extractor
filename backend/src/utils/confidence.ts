export function calculateConfidence(text: string): number {
  let score = 0;

  // Date present
  if (/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(text)) {
    score += 0.3;
  }

  // Amount / currency indicators
  if (/₹|\$|Amount|debited|Dr/i.test(text)) {
    score += 0.3;
  }

  // Balance present
  if (/Bal|Balance/i.test(text)) {
    score += 0.2;
  }

  // Reasonable text length
  if (text.length > 20) {
    score += 0.2;
  }

  return Math.min(score, 1);
}
