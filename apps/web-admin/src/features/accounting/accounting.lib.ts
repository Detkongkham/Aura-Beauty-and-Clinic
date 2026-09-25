/** `YYYY-MM-DD` of the Vientiane day `days` ago. */
export function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() + 7 * 3_600_000 - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
