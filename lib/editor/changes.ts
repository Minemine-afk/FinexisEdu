import type { University } from "@/lib/schema";
import { documentKind, serialize, validateDocument } from "./documents";
import {
  BASE_BRANCH,
  branchSha,
  checks,
  commitFiles,
  commitParent,
  createBranch,
  deleteBranch,
  gh,
  GitHubError,
  issues,
  previewUrl,
  pulls,
  readFile,
  type CheckSummary,
  type PullRequest,
} from "./github";
import { sessionKey } from "./session";
import { MAIN_REGISTRY, normaliseUrl, registeredUrls, registryFile, sourceUrls, withManualSources } from "./registry";

/**
 * Editor changes, kept as pull requests labelled `editor-change`. A pull
 * request's description carries who sent it in a hidden comment; send-back
 * notes are comments. Nothing reaches the live site until a change is
 * approved, which merges it once its checks have passed.
 */

export const CHANGE_LABEL = "editor-change";
export const SENT_BACK_LABEL = "sent-back";
const META = /<!-- finexisedu-editor (\{.*?\}) -->/;
const NOTE = /<!-- finexisedu-note (\{.*?\}) -->\n?/;

export class EditorError extends Error {}

interface Meta {
  author: string;
  undoOf?: number;
  /** A hash of the sign-in session that made the change, so its later edits join it. */
  session?: string;
  /** How many separate edits the change holds; absent for one. */
  count?: number;
}

function readMeta(body: string | null): Meta {
  const m = META.exec(body ?? "");
  try {
    return m ? (JSON.parse(m[1]) as Meta) : { author: "" };
  } catch {
    return { author: "" };
  }
}

const FILE_LINE = /^- `([^`]+)`$/gm;

/** The files a change's description lists. Written with every commit, so unlike GitHub's file list it is never behind. */
function listedFiles(body: string | null): string[] {
  return [...(body ?? "").matchAll(FILE_LINE)].map((m) => m[1]);
}

function writeBody(meta: Meta, summary: string, files: string[]): string {
  return [
    `<!-- finexisedu-editor ${JSON.stringify(meta)} -->`,
    `Sent from the FinexisEdu editor by **${meta.author}**${meta.undoOf ? `, undoing #${meta.undoOf}` : ""}.`,
    "",
    summary,
    "",
    "Files:",
    ...files.map((f) => `- \`${f}\``),
  ].join("\n");
}


export function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) throw new EditorError("Type your name (2 to 60 characters).");
  return n;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "change";
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

const isEditorChange = (p: PullRequest) => p.labels.some((l) => l.name === CHANGE_LABEL);

/* ---------- Loading files to edit ---------- */

export interface LoadedDocument {
  path: string;
  /** The blob sha the edit starts from, so a clash with another edit is caught on sending. */
  sha: string;
  data: unknown;
}

export interface WaitingChange {
  number: number;
  title: string;
  author: string;
  sentBack: boolean;
}

/** Open changes that touch any of these files, other than the one numbered `except`. */
export async function waitingChangesFor(paths: string[], except?: number): Promise<WaitingChange[]> {
  const open = (await pulls.list("open")).filter(isEditorChange);
  const out: WaitingChange[] = [];
  for (const p of open) {
    if (p.number === except) continue;
    const files = await pulls.files(p.number);
    if (files.some((f) => paths.includes(f.filename))) {
      out.push({ number: p.number, title: p.title, author: readMeta(p.body).author, sentBack: p.labels.some((l) => l.name === SENT_BACK_LABEL) });
    }
  }
  return out;
}

/**
 * Everything one person edits in one sign-in goes into a single change, so one
 * approval covers the lot. `batch` is that sitting's open change, if it has one.
 */
export interface Workspace {
  batch: PullRequest | null;
  /** The branch whose file list to use: the sitting's change if there is one, else the live site. */
  treeRef: string;
  /** Where to read a file from: the sitting's change if it has altered the file, else the live site. */
  ref(path: string): string;
}

export async function sessionWorkspace(session?: string): Promise<Workspace> {
  const live: Workspace = { batch: null, treeRef: BASE_BRANCH, ref: () => BASE_BRANCH };
  if (!session) return live;
  const key = sessionKey(session);
  const batch = (await pulls.list("open")).find((p) => {
    if (!isEditorChange(p) || p.labels.some((l) => l.name === SENT_BACK_LABEL)) return false;
    const meta = readMeta(p.body);
    return meta.session === key && !meta.undoOf;
  });
  if (!batch) return live;
  // GitHub's file list can lag a moment behind the latest commit, so the description's list is included too.
  const touched = new Set([
    ...listedFiles(batch.body),
    ...(await pulls.files(batch.number)).flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]),
  ]);
  return { batch, treeRef: batch.head.ref, ref: (path) => (touched.has(path) ? batch.head.ref : BASE_BRANCH) };
}

/** The files as they are live (or on a waiting change's branch, to edit that change). */
export async function loadDocuments(paths: string[], change?: number, ws?: Workspace): Promise<LoadedDocument[]> {
  const fixed = change ? (await openChange(change)).head.ref : undefined;
  return Promise.all(
    paths.map(async (path) => {
      if (!documentKind(path)) throw new EditorError(`${path} cannot be edited here.`);
      const f = await readFile(path, fixed ?? ws?.ref(path) ?? BASE_BRANCH);
      if (f.sha === null || f.text === null) throw new EditorError(`${path} does not exist.`);
      return { path, sha: f.sha, data: JSON.parse(f.text) };
    }),
  );
}

/** Opens files for editing: from the explicit change, else from this sitting's change if it has one, else live. */
export async function openForEditing(paths: string[], change?: number, session?: string) {
  const ws = change ? undefined : await sessionWorkspace(session);
  return {
    documents: await loadDocuments(paths, change, ws),
    waiting: change ? [] : await waitingChangesFor(paths, ws?.batch?.number),
    /** The sitting's change these edits will join. */
    joining: ws?.batch ? { number: ws.batch.number, title: ws.batch.title } : null,
  };
}

async function openChange(n: number): Promise<PullRequest> {
  const p = await pulls.get(n);
  if (!isEditorChange(p) || p.state !== "open") throw new EditorError("That change is no longer waiting for approval.");
  return p;
}

/* ---------- Sending a change ---------- */

export interface SendInput {
  author: string;
  summary: string;
  documents: { path: string; sha: string; data: unknown }[];
  /** The waiting change being edited, if any. */
  change?: number;
  /** The signed-in session; its edits are gathered into one change. */
  session?: string;
}

export async function sendChange(input: SendInput): Promise<number> {
  const author = cleanName(input.author);
  const summary = input.summary.trim();
  if (summary.length < 3 || summary.length > 200) throw new EditorError("Describe the change in a few words (up to 200 characters).");

  for (const d of input.documents) {
    const problems = validateDocument(d.path, d.data);
    if (problems.length) throw new EditorError(`Fix the highlighted problems first (${problems.length} in ${d.path}).`);
  }

  if (input.change) {
    const pr = await openChange(input.change);
    const files = await changedSince(() => pr.head.ref, input.documents);
    if (files.length === 0) throw new EditorError("Nothing has changed.");
    await commitFiles(pr.head.ref, `${summary}\n\nEdited by ${author} in the FinexisEdu editor.`, files);
    const listed = listedFiles(pr.body);
    if (files.some((f) => !listed.includes(f.path))) {
      const all = [...new Set([...listed, ...files.map((f) => f.path)])];
      await pulls.update(pr.number, { body: writeBody(readMeta(pr.body), pr.title.replace(/ and \d+ more$/, ""), all) });
    }
    await issues.removeLabel(pr.number, SENT_BACK_LABEL);
    await issues.comment(pr.number, `<!-- finexisedu-note ${JSON.stringify({ by: author, kind: "updated" })} -->\nUpdated by **${author}**: ${summary}`);
    return pr.number;
  }

  const ws = await sessionWorkspace(input.session);
  const waiting = await waitingChangesFor(
    input.documents.map((d) => d.path),
    ws.batch?.number,
  );
  if (waiting.length) {
    throw new EditorError(`"${waiting[0].title}" is already waiting for approval on this. Approve, send back or discard it first, or edit that change instead.`);
  }
  const files = await changedSince(ws.ref, input.documents);
  if (files.length === 0) throw new EditorError("Nothing has changed.");
  return submitFiles(ws, { author, session: input.session ? sessionKey(input.session) : undefined }, summary, files);
}

/**
 * Sends files as a change: into this sitting's open change if it has one (one
 * approval covers it all), otherwise as a new change.
 */
export async function submitFiles(ws: Workspace, meta: Meta, summary: string, files: { path: string; text: string | null }[]): Promise<number> {
  const batch = ws.batch;
  if (!batch) return openPullRequest(meta, summary, files);
  const before = readMeta(batch.body);
  const count = (before.count ?? 1) + 1;
  const first = batch.title.replace(/ and \d+ more$/, "");
  await commitFiles(batch.head.ref, `${summary}\n\nAdded by ${meta.author} in the FinexisEdu editor.`, files);
  const all = [...new Set([...listedFiles(batch.body), ...files.map((f) => f.path)])];
  await pulls.update(batch.number, { title: `${first} and ${count - 1} more`, body: writeBody({ ...before, count }, first, all) });
  await issues.comment(batch.number, `<!-- finexisedu-note ${JSON.stringify({ by: meta.author, kind: "added" })} -->\nAdded by **${meta.author}**: ${summary}`);
  return batch.number;
}

/** The files whose text differs from `ref`, after checking nobody else changed them since they were loaded. */
async function changedSince(refFor: (path: string) => string, documents: SendInput["documents"]) {
  const out: { path: string; text: string }[] = [];
  for (const d of documents) {
    const current = await readFile(d.path, refFor(d.path));
    if (current.sha !== d.sha) {
      throw new EditorError("Someone else has changed this since you opened it. Copy anything you need, then reload the page to start from their version.");
    }
    const text = serialize(d.data);
    if (text !== current.text) out.push({ path: d.path, text });
  }
  return [...out, ...(await registryUpdates(refFor, out))];
}

/**
 * The scraper tests require every source page a university points at to be in
 * the scraper registry, so new pages are added there as "check by hand".
 */
async function registryUpdates(refFor: (path: string) => string, files: { path: string; text: string | null }[]) {
  const out: { path: string; text: string }[] = [];
  for (const f of files) {
    if (f.text === null || !/^data\/universities\//.test(f.path)) continue;
    const u = JSON.parse(f.text) as University;
    const own = registryFile(u.id);
    const [main, mine] = await Promise.all([readFile(MAIN_REGISTRY, refFor(MAIN_REGISTRY)), readFile(own, refFor(own))]);
    const registered = registeredUrls([main.text, mine.text], u.id);
    const missing = sourceUrls(u).filter((url) => !registered.has(normaliseUrl(url)));
    if (missing.length) out.push({ path: own, text: withManualSources(mine.text, u, missing) });
  }
  return out;
}

export async function openPullRequest(meta: Meta, summary: string, files: { path: string; text: string | null }[]): Promise<number> {
  const branch = `editor/${stamp()}-${slug(summary)}`;
  await createBranch(branch, await branchSha(BASE_BRANCH));
  try {
    await commitFiles(branch, `${summary}\n\nSent by ${meta.author} from the FinexisEdu editor.`, files);
    const pr = await pulls.create(summary, branch, writeBody(meta, summary, files.map((f) => f.path)));
    await issues.addLabels(pr.number, [CHANGE_LABEL]);
    return pr.number;
  } catch (e) {
    await deleteBranch(branch);
    throw e;
  }
}

/* ---------- Approvals ---------- */

export interface ChangeSummary {
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  sentBack: boolean;
  url: string;
}

export async function listChanges(): Promise<{ changes: ChangeSummary[]; others: { number: number; title: string; url: string }[] }> {
  const open = await pulls.list("open");
  return {
    changes: open.filter(isEditorChange).map((p) => ({
      number: p.number,
      title: p.title,
      author: readMeta(p.body).author,
      updatedAt: p.updated_at,
      sentBack: p.labels.some((l) => l.name === SENT_BACK_LABEL),
      url: p.html_url,
    })),
    others: open.filter((p) => !isEditorChange(p)).map((p) => ({ number: p.number, title: p.title, url: p.html_url })),
  };
}

export interface ChangeDetail extends ChangeSummary {
  files: { path: string; before: unknown; after: unknown }[];
  checks: CheckSummary;
  preview?: string;
  /** False when the change clashes with something approved since. */
  mergeable: boolean | null;
  notes: { by: string; kind: string; text: string; at: string }[];
  undoOf?: number;
}

export async function getChange(n: number): Promise<ChangeDetail> {
  const p = await pulls.get(n);
  if (!isEditorChange(p)) throw new EditorError("That is not an editor change.");
  const meta = readMeta(p.body);
  const compare = await gh<{ merge_base_commit: { sha: string } }>("GET", `/compare/${BASE_BRANCH}...${p.head.sha}`);
  const base = compare.merge_base_commit.sha;
  const files = await pulls.files(n);
  // Data files are shown value by value; anything else (the scraper registry) as text.
  const parse = (path: string, text: string | null) => (text === null ? undefined : path.endsWith(".json") ? JSON.parse(text) : text);
  const [contents, check, preview, comments] = await Promise.all([
    Promise.all(
      files.map(async (f) => {
        const [before, after] = await Promise.all([readFile(f.previous_filename ?? f.filename, base), readFile(f.filename, p.head.sha)]);
        return { path: f.filename, before: parse(f.filename, before.text), after: parse(f.filename, after.text) };
      }),
    ),
    checks(p.head.sha),
    previewUrl(p.head.sha).catch(() => undefined),
    issues.comments(n),
  ]);
  return {
    number: p.number,
    title: p.title,
    author: meta.author,
    updatedAt: p.updated_at,
    sentBack: p.labels.some((l) => l.name === SENT_BACK_LABEL),
    url: p.html_url,
    files: contents,
    checks: check,
    preview,
    mergeable: p.state === "open" ? (p.mergeable ?? null) : false,
    notes: comments
      .map((c) => {
        const m = NOTE.exec(c.body);
        if (!m) return undefined;
        const info = JSON.parse(m[1]) as { by: string; kind: string };
        return { ...info, text: c.body.replace(NOTE, "").replace(/^[^*]*\*\*[^*]+\*\*[:.]? ?/, ""), at: c.created_at };
      })
      .filter((x): x is NonNullable<typeof x> => x !== undefined),
    undoOf: meta.undoOf,
  };
}

export async function approveChange(n: number, approver: string): Promise<void> {
  const name = cleanName(approver);
  const p = await openChange(n);
  const meta = readMeta(p.body);
  if (p.labels.some((l) => l.name === SENT_BACK_LABEL)) throw new EditorError("This change was sent back. It needs updating before it can be approved.");
  const result = await checks(p.head.sha);
  if (result.state === "running" || result.state === "none") throw new EditorError("The checks are still running. Try again in a minute.");
  if (result.state === "failed") throw new EditorError(`The checks failed (${result.failed.join(", ")}). Send it back so it can be fixed.`);
  if (p.mergeable === false) throw new EditorError("This change clashes with one approved since. Send it back so it can be redone from the live version.");
  try {
    await pulls.merge(n, p.head.sha, `${p.title} (#${n})`, `Sent by ${meta.author || "an editor"}, approved by ${name} in the FinexisEdu editor.`);
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 405 || e.status === 409)) {
      throw new EditorError("GitHub could not apply this change (it changed or clashes). Reload and try again.");
    }
    throw e;
  }
  await issues.comment(n, `<!-- finexisedu-note ${JSON.stringify({ by: name, kind: "approved" })} -->\nApproved by **${name}**.`).catch(() => undefined);
  await deleteBranch(p.head.ref);
}

export async function sendBackChange(n: number, by: string, note: string): Promise<void> {
  const name = cleanName(by);
  const text = note.trim();
  if (text.length < 3) throw new EditorError("Say what needs changing.");
  const p = await openChange(n);
  await issues.comment(n, `<!-- finexisedu-note ${JSON.stringify({ by: name, kind: "sent back" })} -->\nSent back by **${name}**: ${text}`);
  await issues.addLabels(p.number, [SENT_BACK_LABEL]);
}

export async function discardChange(n: number, by: string): Promise<void> {
  const name = cleanName(by);
  const p = await openChange(n);
  await issues.comment(n, `<!-- finexisedu-note ${JSON.stringify({ by: name, kind: "discarded" })} -->\nDiscarded by **${name}**.`);
  await pulls.update(n, { state: "closed" });
  await deleteBranch(p.head.ref);
}

/* ---------- Versions and undo ---------- */

export interface Version {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  url: string;
  undoOf?: number;
}

export async function listVersions(): Promise<Version[]> {
  const closed = await pulls.list("closed");
  return closed
    .filter((p) => isEditorChange(p) && p.merged_at)
    .sort((a, b) => b.merged_at!.localeCompare(a.merged_at!))
    .map((p) => {
      const meta = readMeta(p.body);
      return { number: p.number, title: p.title, author: meta.author, mergedAt: p.merged_at!, url: p.html_url, undoOf: meta.undoOf };
    });
}

/** Sends a change that puts back every file the latest approved change touched, through the same approval. */
export async function undoLastChange(by: string): Promise<number> {
  const author = cleanName(by);
  const [latest] = await listVersions();
  if (!latest) throw new EditorError("There is no approved editor change to undo.");
  const p = await pulls.get(latest.number);
  const merged = p.merge_commit_sha!;
  const parent = await commitParent(merged);
  const files = await pulls.files(latest.number);
  const restore: { path: string; text: string | null }[] = [];
  for (const f of files) {
    const [atMerge, live] = await Promise.all([readFile(f.filename, merged), readFile(f.filename, BASE_BRANCH)]);
    if (atMerge.sha !== live.sha) {
      throw new EditorError(`${f.filename} has changed again since "${latest.title}", so it cannot simply be put back. Edit it by hand instead.`);
    }
    const before = await readFile(f.previous_filename ?? f.filename, parent);
    restore.push({ path: f.filename, text: before.text });
    if (f.previous_filename && f.previous_filename !== f.filename) restore.push({ path: f.previous_filename, text: before.text });
  }
  const paths = restore.map((r) => r.path);
  const waiting = await waitingChangesFor(paths);
  if (waiting.length) throw new EditorError(`"${waiting[0].title}" is waiting for approval on the same data. Approve, send back or discard it first.`);
  return openPullRequest({ author, undoOf: latest.number }, `Undo: ${latest.title}`, restore);
}
