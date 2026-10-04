/**
 * 全应用统一的日期口径：本地时区的 YYYY-MM-DD 日期键。
 * 目标进度、连续天数、成就日期都必须经由这里，不允许各自切 toISOString。
 */
export const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, '0');

export function toKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return toKey(now);
}

export function shiftKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return toKey(new Date(year, month - 1, day + deltaDays));
}

/** b - a，两个日期键相差的整天数 */
export function diffKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = new Date(ay, am - 1, ad).getTime();
  const tb = new Date(by, bm - 1, bd).getTime();
  return Math.round((tb - ta) / DAY_MS);
}

/** 从 startDate 起，按命中的日期集合向前数连续天数（首日未命中则为 0） */
export function forwardRun(startDate: string, hitDates: Set<string>, nowKey: string = todayKey()): number {
  let run = 0;
  let cursor = startDate;
  // 不会晚于今天：今天尚未记录时不应把今天算成断签
  while (diffKeys(cursor, nowKey) >= 0 && hitDates.has(cursor)) {
    run += 1;
    cursor = shiftKey(cursor, 1);
  }
  return run;
}
