const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 返回北京时间日历日期，不受 Node/Vercel 运行时默认时区影响。 */
export function shanghaiDate(now: number | Date = Date.now()): string {
  const parts = DATE_FORMATTER.formatToParts(
    now instanceof Date ? now : new Date(now),
  );
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
