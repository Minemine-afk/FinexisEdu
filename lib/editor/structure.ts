import { Country, type University } from "@/lib/schema";
import { cleanName, EditorError, sessionWorkspace, submitFiles, waitingChangesFor, type Workspace } from "./changes";
import { countryPath, serialize, universityPath, validateDocument } from "./documents";
import { listPaths, readFile } from "./github";
import { sessionKey } from "./session";
import { MAIN_REGISTRY, parseSources, registryFile, sourceUrls, withManualSources, withoutUniversity } from "./registry";

/**
 * Adding and removing universities and countries. Each touches several files
 * (the data file, the scraper registry, the shortlist, the site settings,
 * the exchange-rate fallback), so the server decides which ones; the result
 * is an ordinary change that waits for approval. Each takes the signed-in
 * session so it joins that sitting's change, and reads any file that change
 * has already altered from there, so earlier edits are not overwritten.
 */

const SETTINGS = "data/settings.json";
const RATIONALE = "data/rationale.json";
const FX_FALLBACK = "data/fx-fallback.json";
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type FileChange = { path: string; text: string | null };

const meta = (author: string, session?: string) => ({ author, session: session ? sessionKey(session) : undefined });

async function readJson<T>(ws: Workspace, path: string): Promise<{ sha: string | null; data: T | null; text: string | null }> {
  const f = await readFile(path, ws.ref(path));
  return { sha: f.sha, text: f.text, data: f.text === null ? null : (JSON.parse(f.text) as T) };
}

async function nothingWaitingOn(ws: Workspace, paths: string[]) {
  const waiting = await waitingChangesFor(paths, ws.batch?.number);
  if (waiting.length) throw new EditorError(`"${waiting[0].title}" is waiting for approval on the same data. Approve, send back or discard it first.`);
}

export async function addUniversity(by: string, input: University, session?: string): Promise<number> {
  const author = cleanName(by);
  const ws = await sessionWorkspace(session);
  const id = String(input.id ?? "");
  const country = String(input.country ?? "");
  if (!ID.test(id) || id.length > 40) throw new EditorError("The short id must be lower-case letters, digits and dashes, e.g. new-university.");
  const paths = await listPaths(ws.treeRef);
  if (!paths.has(countryPath(country))) throw new EditorError("Choose one of the countries in the calculator (add the country first if it is new).");
  if ([...paths].some((p) => p.endsWith(`/${id}.json`) && p.startsWith("data/universities/")) || paths.has(registryFile(id))) {
    throw new EditorError(`The id "${id}" is already used. Pick another.`);
  }
  const countryFile = await readJson<Country>(ws, countryPath(country));
  const data = { ...input, currency: countryFile.data!.currency };
  const path = universityPath(country, id);
  const problems = validateDocument(path, data);
  if (problems.length) throw new EditorError(`Fix the highlighted problems first (${problems.length}).`);
  if (data.programmes.length === 0) throw new EditorError("Add at least one programme.");
  await nothingWaitingOn(ws, [path]);
  return submitFiles(ws, meta(author, session), `Add ${data.name}`, [
    { path, text: serialize(data) },
    { path: registryFile(id), text: withManualSources(null, data, sourceUrls(data)) },
  ]);
}

export async function removeUniversity(by: string, country: string, id: string, session?: string): Promise<number> {
  const author = cleanName(by);
  const ws = await sessionWorkspace(session);
  const path = universityPath(country, id);
  const uni = await readJson<University>(ws, path);
  if (!uni.data) throw new EditorError("That university is not in the calculator any more.");
  const files: FileChange[] = [{ path, text: null }];

  const own = await readFile(registryFile(id), ws.ref(registryFile(id)));
  if (own.text !== null) files.push({ path: registryFile(id), text: null });
  const main = await readFile(MAIN_REGISTRY, ws.ref(MAIN_REGISTRY));
  if (main.text && parseSources(main.text).some((b) => b.university === id)) {
    files.push({ path: MAIN_REGISTRY, text: withoutUniversity(main.text, id) });
  }
  const rationale = await readJson<Record<string, unknown>>(ws, RATIONALE);
  if (rationale.data && `${country}/${id}` in rationale.data) {
    const rest = { ...rationale.data };
    delete rest[`${country}/${id}`];
    files.push({ path: RATIONALE, text: serialize(rest) });
  }
  await nothingWaitingOn(ws, files.map((f) => f.path));
  return submitFiles(ws, meta(author, session), `Remove ${uni.data.name}`, files);
}

export interface NewCountry {
  code: string;
  name: string;
  currency: string;
  defaultFeeIncrease: number;
  livingCostIncrease?: number;
  /** 0-11; left out when it is the usual month. */
  intakeMonth?: number;
}

/** The SGD rate for a currency from the European Central Bank (via Frankfurter), or undefined if it has none. */
async function sgdRate(currency: string): Promise<{ rate: number } | undefined> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=SGD&symbols=${currency}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { rates?: Record<string, number> };
    const rate = body.rates?.[currency];
    return rate && rate > 0 ? { rate } : undefined;
  } catch {
    return undefined;
  }
}

export async function addCountry(by: string, input: NewCountry, session?: string): Promise<number> {
  const author = cleanName(by);
  const ws = await sessionWorkspace(session);
  const { intakeMonth, ...fields } = input;
  const country = { ...fields, code: fields.code.trim().toLowerCase(), currency: fields.currency.trim().toUpperCase() };
  const parsed = Country.safeParse(country);
  if (!parsed.success) throw new EditorError(`Check the country details: ${parsed.error.issues[0].message}.`);
  const path = countryPath(country.code);
  const paths = await listPaths(ws.treeRef);
  if (paths.has(path)) throw new EditorError(`There is already a country with the code "${country.code}".`);

  const files: FileChange[] = [{ path, text: serialize(parsed.data) }];
  const fx = await readJson<{ base: string; date: string; rates: Record<string, number> }>(ws, FX_FALLBACK);
  if (country.currency !== "SGD" && !fx.data!.rates[country.currency]) {
    const live = await sgdRate(country.currency);
    if (!live) {
      throw new EditorError(`The European Central Bank does not publish a Singapore dollar rate for ${country.currency}, so the calculator could not convert its fees.`);
    }
    const rates = Object.fromEntries(Object.entries({ ...fx.data!.rates, [country.currency]: live.rate }).sort(([a], [b]) => a.localeCompare(b)));
    files.push({ path: FX_FALLBACK, text: serialize({ ...fx.data, rates }) });
  }
  const settings = await readJson<{ countryOrder: string[]; intakeMonth: Record<string, number>; defaultIntakeMonth: number }>(ws, SETTINGS);
  const s = settings.data!;
  const next = {
    ...s,
    countryOrder: [...s.countryOrder, country.code],
    intakeMonth: intakeMonth === undefined || intakeMonth === s.defaultIntakeMonth ? s.intakeMonth : { ...s.intakeMonth, [country.code]: intakeMonth },
  };
  const problems = validateDocument(SETTINGS, next);
  if (problems.length) throw new EditorError(`The intake month is not valid (${problems[0].message}).`);
  files.push({ path: SETTINGS, text: serialize(next) });
  await nothingWaitingOn(ws, files.map((f) => f.path));
  return submitFiles(ws, meta(author, session), `Add ${country.name}`, files);
}

export async function removeCountry(by: string, code: string, session?: string): Promise<number> {
  const author = cleanName(by);
  const ws = await sessionWorkspace(session);
  const path = countryPath(code);
  const country = await readJson<Country>(ws, path);
  if (!country.data) throw new EditorError("That country is not in the calculator any more.");
  const paths = await listPaths(ws.treeRef);
  if ([...paths].some((p) => p.startsWith(`data/universities/${code}/`))) {
    throw new EditorError(`Remove ${country.data.name}'s universities first.`);
  }
  const settings = await readJson<{ countryOrder: string[]; intakeMonth: Record<string, number> }>(ws, SETTINGS);
  const s = settings.data!;
  const intake = { ...s.intakeMonth };
  delete intake[code];
  const files: FileChange[] = [
    { path, text: null },
    { path: SETTINGS, text: serialize({ ...s, countryOrder: s.countryOrder.filter((c) => c !== code), intakeMonth: intake }) },
  ];
  await nothingWaitingOn(ws, files.map((f) => f.path));
  return submitFiles(ws, meta(author, session), `Remove ${country.data.name}`, files);
}
