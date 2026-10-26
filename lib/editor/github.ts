/**
 * The few GitHub REST calls the editor needs. Every change goes through a
 * branch and a pull request in the repository, so the site only ever changes
 * when a pull request is merged (and its checks have passed).
 *
 * Environment: EDITOR_GITHUB_TOKEN, a fine-grained token limited to this
 * repository with read and write access to Contents, Pull requests and Issues,
 * and read access to Checks, Commit statuses and Deployments; and optionally
 * EDITOR_GITHUB_REPO ("owner/name", default below).
 */

export const BASE_BRANCH = "main";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** For a refused request, the token permissions GitHub says would allow it, e.g. "checks=read". */
    readonly needs = "",
  ) {
    super(message);
  }
}

export function savingConfigured(): boolean {
  return Boolean(process.env.EDITOR_GITHUB_TOKEN);
}

function repo(): string {
  return process.env.EDITOR_GITHUB_REPO || "Minemine-afk/FinexisEdu";
}

export async function gh<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.EDITOR_GITHUB_TOKEN;
  if (!token) throw new GitHubError(0, "Saving is not switched on yet: the GitHub token still needs to be added.");
  // EDITOR_GITHUB_API points the editor at a stand-in GitHub for local testing.
  const api = process.env.EDITOR_GITHUB_API || "https://api.github.com";
  const res = await fetch(`${api}/repos/${repo()}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GitHubError(
      res.status,
      `GitHub ${method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`,
      res.headers.get("x-accepted-github-permissions") ?? "",
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const enc = encodeURIComponent;

export interface FileAtRef {
  /** The file's blob sha, or null when it does not exist at that ref. */
  sha: string | null;
  text: string | null;
}

export async function readFile(path: string, ref: string): Promise<FileAtRef> {
  try {
    const f = await gh<{ sha: string; content: string; encoding: string }>(
      "GET",
      `/contents/${path.split("/").map(enc).join("/")}?ref=${enc(ref)}`,
    );
    if (f.encoding === "base64") return { sha: f.sha, text: Buffer.from(f.content, "base64").toString("utf8") };
    // Files over 1 MB come without content; read them as a blob.
    const blob = await gh<{ content: string }>("GET", `/git/blobs/${f.sha}`);
    return { sha: f.sha, text: Buffer.from(blob.content, "base64").toString("utf8") };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return { sha: null, text: null };
    throw e;
  }
}

export async function branchSha(branch: string): Promise<string> {
  return (await gh<{ object: { sha: string } }>("GET", `/git/ref/heads/${branch}`)).object.sha;
}

export async function createBranch(branch: string, sha: string): Promise<void> {
  await gh("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha });
}

export async function deleteBranch(branch: string): Promise<void> {
  await gh("DELETE", `/git/refs/heads/${branch}`).catch(() => undefined);
}

/** Commits new contents (or deletions, with `text: null`) for several files as one commit on top of `branch`. */
export async function commitFiles(branch: string, message: string, files: { path: string; text: string | null }[]): Promise<string> {
  const head = await branchSha(branch);
  const commit = await gh<{ tree: { sha: string } }>("GET", `/git/commits/${head}`);
  const tree = await gh<{ sha: string }>("POST", "/git/trees", {
    base_tree: commit.tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", ...(f.text === null ? { sha: null } : { content: f.text }) })),
  });
  const created = await gh<{ sha: string }>("POST", "/git/commits", { message, tree: tree.sha, parents: [head] });
  await gh("PATCH", `/git/refs/heads/${branch}`, { sha: created.sha });
  return created.sha;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  mergeable?: boolean | null;
  labels: { name: string }[];
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
}

export const pulls = {
  create: (title: string, head: string, body: string) =>
    gh<PullRequest>("POST", "/pulls", { title, head, base: BASE_BRANCH, body, maintainer_can_modify: true }),
  get: (n: number) => gh<PullRequest>("GET", `/pulls/${n}`),
  list: (state: "open" | "closed") =>
    gh<PullRequest[]>("GET", `/pulls?state=${state}&base=${BASE_BRANCH}&sort=updated&direction=desc&per_page=50`),
  files: (n: number) => gh<{ filename: string; status: string; previous_filename?: string }[]>("GET", `/pulls/${n}/files?per_page=100`),
  update: (n: number, fields: { title?: string; body?: string; state?: "open" | "closed" }) => gh<PullRequest>("PATCH", `/pulls/${n}`, fields),
  merge: (n: number, sha: string, title: string, message: string) =>
    gh<{ merged: boolean; sha: string }>("PUT", `/pulls/${n}/merge`, { merge_method: "squash", sha, commit_title: title, commit_message: message }),
};

export const issues = {
  addLabels: (n: number, labels: string[]) => gh("POST", `/issues/${n}/labels`, { labels }),
  removeLabel: (n: number, label: string) => gh("DELETE", `/issues/${n}/labels/${enc(label)}`).catch(() => undefined),
  comment: (n: number, body: string) => gh("POST", `/issues/${n}/comments`, { body }),
  comments: (n: number) => gh<{ body: string; created_at: string }[]>("GET", `/issues/${n}/comments?per_page=100`),
};

export interface CheckSummary {
  state: "passed" | "running" | "failed" | "none";
  failed: string[];
}

/** The combined result of the CI checks and commit statuses on a commit. */
export async function checks(sha: string): Promise<CheckSummary> {
  const [runs, status] = await Promise.all([
    gh<{ check_runs: { name: string; status: string; conclusion: string | null }[] }>("GET", `/commits/${sha}/check-runs?per_page=100`),
    gh<{ statuses: { context: string; state: string }[] }>("GET", `/commits/${sha}/status`),
  ]);
  const items = [
    ...runs.check_runs.map((r) => ({
      name: r.name,
      state: r.status !== "completed" ? "running" : ["success", "skipped", "neutral"].includes(r.conclusion ?? "") ? "passed" : "failed",
    })),
    ...status.statuses.map((s) => ({ name: s.context, state: s.state === "pending" ? "running" : s.state === "success" ? "passed" : "failed" })),
  ];
  const failed = items.filter((i) => i.state === "failed").map((i) => i.name);
  if (items.length === 0) return { state: "none", failed };
  if (failed.length) return { state: "failed", failed };
  return { state: items.some((i) => i.state === "running") ? "running" : "passed", failed };
}

/** The preview site Vercel built for a commit, when it has finished. */
export async function previewUrl(sha: string): Promise<string | undefined> {
  const deployments = await gh<{ id: number }[]>("GET", `/deployments?sha=${sha}&per_page=5`);
  for (const d of deployments) {
    const statuses = await gh<{ state: string; environment_url?: string; target_url?: string }[]>("GET", `/deployments/${d.id}/statuses?per_page=5`);
    const ok = statuses.find((s) => s.state === "success");
    if (ok) return ok.environment_url || ok.target_url;
  }
  return undefined;
}

export async function commitParent(sha: string): Promise<string> {
  const c = await gh<{ parents: { sha: string }[] }>("GET", `/git/commits/${sha}`);
  return c.parents[0].sha;
}

/** Every file path in the repository at a ref. */
export async function listPaths(ref: string): Promise<Set<string>> {
  const t = await gh<{ tree: { path: string; type: string }[]; truncated: boolean }>("GET", `/git/trees/${enc(ref)}?recursive=1`);
  if (t.truncated) throw new GitHubError(0, "The repository listing was cut short.");
  return new Set(t.tree.filter((e) => e.type === "blob").map((e) => e.path));
}
