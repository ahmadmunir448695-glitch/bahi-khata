const rs = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
export const money = (n) => "Rs " + rs.format(Math.abs(n || 0));

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayYearFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// "Today", "Yesterday", "12 Sep", or "12 Sep 2025" for older years. Takes "YYYY-MM-DD".
export function dayLabel(ymd, today) {
  if (!ymd) return "";
  if (ymd === today) return "Today";
  const y = new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  if (ymd === y) return "Yesterday";
  const d = new Date(ymd + "T00:00:00Z");
  return ymd.slice(0, 4) === today.slice(0, 4) ? dayFmt.format(d) : dayYearFmt.format(d);
}

export const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
