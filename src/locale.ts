export function formatNumber(value: number, maximumFractionDigits = 8): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(value);
}

export function formatPrice(value: number, currency: string): string {
  return formatNumber(value) + " " + currency.toUpperCase();
}

export function formatDateTime(timestamp: number, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}
