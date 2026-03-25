export function nowTs(): number {
  return Date.now();
}

export function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}
