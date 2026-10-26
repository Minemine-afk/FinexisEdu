/**
 * The scraper registry (scrapers/registry.yaml and scrapers/registry.d/<id>.yaml)
 * must list every programme's and living-cost estimate's source page, or the
 * scraper tests fail. These helpers read the `- university:` / `url:` pairs out
 * of those files and add "check by hand" entries for pages the editor
 * introduces, without touching anything else in the files.
 */

export const MAIN_REGISTRY = "scrapers/registry.yaml";
export const registryFile = (id: string) => `scrapers/registry.d/${id}.yaml`;

/** The same comparison pydantic's HttpUrl makes: lower-case host, "/" for an empty path. */
export function normaliseUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v.replace(/\s+#.*$/, "");
}

export interface SourceBlock {
  university: string;
  url?: string;
  /** Line numbers [start, end) of the block in the file. */
  start: number;
  end: number;
}

/** The sources listed in a registry file, with where each block sits. */
export function parseSources(text: string): SourceBlock[] {
  const lines = text.split("\n");
  const blocks: SourceBlock[] = [];
  let current: SourceBlock | undefined;
  lines.forEach((line, i) => {
    const start = /^ {2}- university:\s*(.+)$/.exec(line);
    if (start) {
      if (current) current.end = i;
      current = { university: unquote(start[1]), start: i, end: lines.length };
      blocks.push(current);
      return;
    }
    // A comment or a new item at the list's indent ends the block.
    if (current && /^ {0,2}(?:- |#)/.test(line)) {
      current.end = i;
      current = undefined;
      return;
    }
    const url = /^ {4}url:\s*(.+)$/.exec(line);
    if (current && url) current.url = unquote(url[1]);
  });
  // Trailing blank lines are not part of the last block.
  for (const b of blocks) while (b.end > b.start + 1 && lines[b.end - 1].trim() === "") b.end--;
  return blocks;
}

/** Source pages already registered for a university, normalised. */
export function registeredUrls(files: (string | null)[], university: string): Set<string> {
  const out = new Set<string>();
  for (const text of files) {
    if (!text) continue;
    for (const b of parseSources(text)) if (b.university === university && b.url) out.add(normaliseUrl(b.url));
  }
  return out;
}

/** Every source page a university file points at (programmes and living costs). */
export function sourceUrls(university: { programmes: { sourceUrl: string }[]; livingCosts?: { sourceUrl: string } }): string[] {
  const urls = university.programmes.map((p) => p.sourceUrl);
  if (university.livingCosts) urls.push(university.livingCosts.sourceUrl);
  return [...new Set(urls)];
}

/** The university's own registry file with "check by hand" entries added for `urls`. */
export function withManualSources(existing: string | null, u: { id: string; name: string; country: string }, urls: string[]): string {
  const entries = urls.flatMap((url) => [`  - university: ${u.id}`, `    country: ${u.country}`, `    url: ${JSON.stringify(url)}`, "    manual: true"]);
  if (!existing) {
    return [`# ${u.name}: pages added in the FinexisEdu editor, checked by hand.`, "sources:", ...entries, ""].join("\n");
  }
  return `${existing.replace(/\n*$/, "\n")}  # Added in the FinexisEdu editor; checked by hand.\n${entries.join("\n")}\n`;
}

/** A registry file without the given university's blocks (and their comments directly above). */
export function withoutUniversity(text: string, university: string): string {
  const lines = text.split("\n");
  const drop = new Set<number>();
  for (const b of parseSources(text)) {
    if (b.university !== university) continue;
    for (let i = b.start; i < b.end; i++) drop.add(i);
    for (let i = b.start - 1; i >= 0 && /^ {2}#/.test(lines[i]); i--) drop.add(i);
  }
  return lines.filter((_, i) => !drop.has(i)).join("\n");
}
