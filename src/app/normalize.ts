export function normDigits(s: string): string {
  return (s ?? "").replace(/\D+/g, "").trim();
}