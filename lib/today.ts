/**
 * Today's date in Singapore as YYYY-MM-DD. The site is for Singapore families,
 * so "this month" follows Singapore time, not the server's UTC clock.
 */
export function singaporeToday(at: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
