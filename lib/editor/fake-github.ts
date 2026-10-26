import { createHash } from "node:crypto";

/** A small in-memory GitHub: commits of whole file trees, branches, pull requests, labels and comments. */
export class FakeGitHub {
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, { tree: string; parents: string[] }>();
  branches = new Map<string, string>();
  pulls: {
    number: number;
    title: string;
    body: string;
    state: "open" | "closed";
    head: string;
    headSha: string;
    merged_at: string | null;
    merge_commit_sha: string | null;
    labels: Set<string>;
    comments: { body: string; created_at: string }[];
  }[] = [];
  checkState: "success" | "in_progress" | "failure" = "success";
  private n = 0;

  constructor(files: Record<string, string>) {
    const tree = this.newTree(new Map(Object.entries(files)));
    this.branches.set("main", this.newCommit(tree, []));
  }

  private id(prefix: string) {
    return `${prefix}${++this.n}`.padEnd(40, "0");
  }
  private newTree(files: Map<string, string>) {
    const id = this.id("t");
    this.trees.set(id, files);
    return id;
  }
  private newCommit(tree: string, parents: string[]) {
    const id = this.id("c");
    this.commits.set(id, { tree, parents });
    return id;
  }
  resolve(ref: string) {
    return this.branches.get(ref) ?? (this.commits.has(ref) ? ref : undefined);
  }
  filesAt(ref: string) {
    return this.trees.get(this.commits.get(this.resolve(ref)!)!.tree)!;
  }
  /** A commit straight onto main, as if someone else changed the data. */
  commitToMain(path: string, text: string) {
    const files = new Map(this.filesAt("main"));
    files.set(path, text);
    this.branches.set("main", this.newCommit(this.newTree(files), [this.branches.get("main")!]));
  }
  private ancestors(sha: string) {
    const out: string[] = [];
    for (let s: string | undefined = sha; s; s = this.commits.get(s)?.parents[0]) out.push(s);
    return out;
  }
  private mergeBase(a: string, b: string) {
    const left = new Set(this.ancestors(a));
    return this.ancestors(b).find((s) => left.has(s))!;
  }
  private changedFiles(from: string, to: string) {
    const a = this.filesAt(from);
    const b = this.filesAt(to);
    return [...new Set([...a.keys(), ...b.keys()])]
      .filter((p) => a.get(p) !== b.get(p))
      .map((p) => ({ filename: p, status: !a.has(p) ? "added" : !b.has(p) ? "removed" : "modified" }));
  }
  private pr(n: number) {
    return this.pulls.find((p) => p.number === n)!;
  }
  private prJson(p: FakeGitHub["pulls"][number]) {
    return {
      number: p.number,
      title: p.title,
      body: p.body,
      state: p.state,
      html_url: `https://github.com/x/y/pull/${p.number}`,
      created_at: "2026-10-25T00:00:00Z",
      updated_at: "2026-10-25T00:00:00Z",
      merged_at: p.merged_at,
      merge_commit_sha: p.merge_commit_sha,
      mergeable: true,
      labels: [...p.labels].map((name) => ({ name })),
      head: { ref: p.head, sha: this.branches.get(p.head) ?? p.headSha },
      base: { ref: "main", sha: this.branches.get("main") },
    };
  }

  handle(method: string, url: URL, body: Record<string, unknown>): [number, unknown] {
    const path = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "");
    let m: RegExpExecArray | null;
    const sha1 = (t: string) => createHash("sha1").update(t).digest("hex");
    if (method === "GET" && (m = /^\/contents\/(.+)$/.exec(path))) {
      const ref = url.searchParams.get("ref")!;
      const text = this.resolve(ref) ? this.filesAt(ref).get(decodeURIComponent(m[1])) : undefined;
      if (text === undefined) return [404, { message: "Not Found" }];
      return [200, { sha: sha1(text), encoding: "base64", content: Buffer.from(text).toString("base64") }];
    }
    if (method === "GET" && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) {
      const sha = this.branches.get(m[1]);
      return sha ? [200, { object: { sha } }] : [404, {}];
    }
    if (method === "POST" && path === "/git/refs") {
      this.branches.set(String(body.ref).replace("refs/heads/", ""), String(body.sha));
      return [201, {}];
    }
    if ((method === "PATCH" || method === "DELETE") && (m = /^\/git\/refs\/heads\/(.+)$/.exec(path))) {
      if (method === "DELETE") this.branches.delete(m[1]);
      else this.branches.set(m[1], String(body.sha));
      return [method === "DELETE" ? 204 : 200, {}];
    }
    if (method === "GET" && (m = /^\/git\/commits\/(.+)$/.exec(path))) {
      const c = this.commits.get(m[1])!;
      return [200, { tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })) }];
    }
    if (method === "POST" && path === "/git/trees") {
      const files = new Map(this.trees.get(String(body.base_tree))!);
      for (const e of body.tree as { path: string; content?: string; sha?: null }[]) {
        if (e.sha === null) files.delete(e.path);
        else files.set(e.path, e.content!);
      }
      return [201, { sha: this.newTree(files) }];
    }
    if (method === "POST" && path === "/git/commits") {
      return [201, { sha: this.newCommit(String(body.tree), body.parents as string[]) }];
    }
    if (method === "POST" && path === "/pulls") {
      const p = {
        number: this.pulls.length + 1,
        title: String(body.title),
        body: String(body.body),
        state: "open" as const,
        head: String(body.head),
        headSha: this.branches.get(String(body.head))!,
        merged_at: null,
        merge_commit_sha: null,
        labels: new Set<string>(),
        comments: [],
      };
      this.pulls.push(p);
      return [201, this.prJson(p)];
    }
    if (method === "GET" && path === "/pulls") {
      return [200, this.pulls.filter((p) => p.state === url.searchParams.get("state")).reverse().map((p) => this.prJson(p))];
    }
    if ((m = /^\/pulls\/(\d+)$/.exec(path))) {
      const p = this.pr(Number(m[1]));
      if (method === "PATCH") Object.assign(p, body);
      return [200, this.prJson(p)];
    }
    if (method === "GET" && (m = /^\/pulls\/(\d+)\/files$/.exec(path))) {
      const p = this.pr(Number(m[1]));
      if (p.merge_commit_sha) return [200, this.changedFiles(this.commits.get(p.merge_commit_sha)!.parents[0], p.merge_commit_sha)];
      const head = this.branches.get(p.head)!;
      return [200, this.changedFiles(this.mergeBase(this.branches.get("main")!, head), head)];
    }
    if (method === "PUT" && (m = /^\/pulls\/(\d+)\/merge$/.exec(path))) {
      const p = this.pr(Number(m[1]));
      const head = this.branches.get(p.head)!;
      if (body.sha !== head) return [409, { message: "Head branch was modified" }];
      const main = this.branches.get("main")!;
      const files = new Map(this.filesAt("main"));
      for (const f of this.changedFiles(this.mergeBase(main, head), head)) {
        const text = this.filesAt(head).get(f.filename);
        if (text === undefined) files.delete(f.filename);
        else files.set(f.filename, text);
      }
      const sha = this.newCommit(this.newTree(files), [main]);
      this.branches.set("main", sha);
      Object.assign(p, { state: "closed", merged_at: new Date(Date.now() + this.n * 1000).toISOString(), merge_commit_sha: sha, headSha: head });
      return [200, { merged: true, sha }];
    }
    if ((m = /^\/issues\/(\d+)\/labels(?:\/(.+))?$/.exec(path))) {
      const p = this.pr(Number(m[1]));
      if (method === "POST") for (const l of body.labels as string[]) p.labels.add(l);
      else p.labels.delete(decodeURIComponent(m[2]));
      return [200, {}];
    }
    if ((m = /^\/issues\/(\d+)\/comments$/.exec(path))) {
      const p = this.pr(Number(m[1]));
      if (method === "POST") p.comments.push({ body: String(body.body), created_at: "2026-10-25T01:00:00Z" });
      return [200, p.comments];
    }
    if (method === "GET" && /^\/commits\/[^/]+\/check-runs$/.test(path)) {
      const done = this.checkState !== "in_progress";
      return [200, { check_runs: [{ name: "web", status: done ? "completed" : "in_progress", conclusion: done ? this.checkState : null }] }];
    }
    if (method === "GET" && /^\/commits\/[^/]+\/status$/.test(path)) return [200, { statuses: [] }];
    if (method === "GET" && path === "/deployments") return [200, [{ id: 1 }]];
    if (method === "GET" && path === "/deployments/1/statuses") return [200, [{ state: "success", environment_url: "https://preview.example" }]];
    if (method === "GET" && (m = /^\/compare\/main\.\.\.(.+)$/.exec(path))) {
      return [200, { merge_base_commit: { sha: this.mergeBase(this.branches.get("main")!, m[1]) } }];
    }
    throw new Error(`Fake GitHub has no ${method} ${path}`);
  }
}
