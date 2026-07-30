export function slugifyMarkdownHeading(text: string): string {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

export function uniqueMarkdownHeadingId(
  text: string,
  seen: Map<string, number>,
): string {
  const base = slugifyMarkdownHeading(text);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}
