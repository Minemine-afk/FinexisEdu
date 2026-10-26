import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveChange,
  discardChange,
  getChange,
  listChanges,
  listVersions,
  loadDocuments,
  openForEditing,
  sendBackChange,
  sendChange,
  undoLastChange,
} from "./changes";
import { FakeGitHub } from "./fake-github";

const NUS = "data/universities/sg/nus.json";
const NTU = "data/universities/sg/ntu.json";
const original = fs.readFileSync(NUS, "utf8");
let github: FakeGitHub;

beforeEach(() => {
  github = new FakeGitHub({
    [NUS]: original,
    [NTU]: fs.readFileSync(NTU, "utf8"),
    "README.md": "hi",
    "scrapers/registry.yaml": fs.readFileSync("scrapers/registry.yaml", "utf8"),
    "scrapers/registry.d/nus.yaml": fs.readFileSync("scrapers/registry.d/nus.yaml", "utf8"),
    "scrapers/registry.d/ntu.yaml": fs.readFileSync("scrapers/registry.d/ntu.yaml", "utf8"),
  });
  vi.stubEnv("EDITOR_GITHUB_TOKEN", "test-token");
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const [status, json] = github.handle(init.method ?? "GET", new URL(input), init.body ? JSON.parse(String(init.body)) : {});
    return new Response(status === 204 ? null : JSON.stringify(json), { status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function editNus(change?: number) {
  const [doc] = await loadDocuments([NUS], change);
  const data = structuredClone(doc.data) as { programmes: { fees: { international: { annualTuition: number } } }[] };
  data.programmes[0].fees.international.annualTuition += 100;
  return { path: NUS, sha: doc.sha, data };
}

describe("editor changes", () => {
  it("sends, approves, records and undoes a change, whoever approves", async () => {
    const n = await sendChange({ author: "Ana", summary: "Raise a fee", documents: [await editNus()] });
    expect(github.filesAt("main").get(NUS)).toBe(original);
    expect((await listChanges()).changes).toMatchObject([{ number: n, author: "Ana", title: "Raise a fee", sentBack: false }]);

    const detail = await getChange(n);
    expect(detail.preview).toBe("https://preview.example");
    expect(detail.files).toHaveLength(1);

    // A second change to the same file waits for the first.
    await expect(sendChange({ author: "Ben", summary: "Another", documents: [await editNus()] })).rejects.toThrow(/already waiting/);
    github.checkState = "in_progress";
    await expect(approveChange(n, "Ben")).rejects.toThrow(/still running/);
    github.checkState = "failure";
    await expect(approveChange(n, "Ben")).rejects.toThrow(/checks failed/);
    github.checkState = "success";

    // The sender can approve their own change.
    await approveChange(n, "Ana");
    const live = JSON.parse(github.filesAt("main").get(NUS)!);
    expect(live.programmes[0].fees.international.annualTuition).toBe(JSON.parse(original).programmes[0].fees.international.annualTuition + 100);
    expect([...github.branches.keys()]).toEqual(["main"]);
    expect(await listVersions()).toMatchObject([{ number: n, title: "Raise a fee", author: "Ana" }]);

    const undo = await undoLastChange("Cat");
    await approveChange(undo, "Ana");
    expect(github.filesAt("main").get(NUS)).toBe(original);
    // The restored version can be edited again like any other.
    const again = await sendChange({ author: "Cat", summary: "Edit after undo", documents: [await editNus()] });
    expect(again).toBeGreaterThan(undo);
  });

  it("lists a new source page for the monthly check, to be checked by hand", async () => {
    const doc = await editNus();
    (doc.data as unknown as { programmes: { sourceUrl: string }[] }).programmes[0].sourceUrl = "https://www.nus.edu.sg/new-fees";
    const n = await sendChange({ author: "Ana", summary: "New source", documents: [doc] });
    const files = (await getChange(n)).files.map((f) => f.path);
    expect(files).toEqual([NUS, "scrapers/registry.d/nus.yaml"]);
    const registry = github.filesAt(`editor/${github.pulls[0].head.split("/")[1]}`).get("scrapers/registry.d/nus.yaml")!;
    expect(registry).toContain('url: "https://www.nus.edu.sg/new-fees"\n    manual: true');
  });

  it("stops a change made from a version someone else has changed since", async () => {
    const doc = await editNus();
    github.commitToMain(NUS, original.replace('"city": "Singapore"', '"city": "Singapura"'));
    await expect(sendChange({ author: "Ana", summary: "Raise a fee", documents: [doc] })).rejects.toThrow(/Someone else has changed this/);
  });

  it("refuses changes that fail the checks, or that change nothing", async () => {
    const [doc] = await loadDocuments([NUS]);
    await expect(sendChange({ author: "Ana", summary: "Nothing", documents: [doc] })).rejects.toThrow(/Nothing has changed/);
    const bad = structuredClone(doc.data) as { name: string };
    bad.name = "";
    await expect(sendChange({ author: "Ana", summary: "Bad", documents: [{ ...doc, data: bad }] })).rejects.toThrow(/Fix the highlighted problems/);
    await expect(sendChange({ author: "A", summary: "Raise", documents: [await editNus()] })).rejects.toThrow(/your name/);
    await expect(loadDocuments(["README.md"])).rejects.toThrow(/cannot be edited/);
  });

  it("sends a change back, takes an update on the same change, then lets it be approved", async () => {
    const n = await sendChange({ author: "Ana", summary: "Raise a fee", documents: [await editNus()] });
    await sendBackChange(n, "Ben", "Use the 2027 figure");
    expect((await getChange(n)).notes).toMatchObject([{ by: "Ben", kind: "sent back", text: "Use the 2027 figure" }]);
    await expect(approveChange(n, "Ben")).rejects.toThrow(/sent back/);

    const updated = await editNus(n);
    expect(await sendChange({ author: "Ana", summary: "Use 2027", documents: [updated], change: n })).toBe(n);
    expect((await getChange(n)).sentBack).toBe(false);
    await approveChange(n, "Ben");
    const live = JSON.parse(github.filesAt("main").get(NUS)!);
    expect(live.programmes[0].fees.international.annualTuition).toBe(JSON.parse(original).programmes[0].fees.international.annualTuition + 200);
  });

  it("discards a change without touching the live data", async () => {
    const n = await sendChange({ author: "Ana", summary: "Raise a fee", documents: [await editNus()] });
    await discardChange(n, "Ben");
    expect(github.filesAt("main").get(NUS)).toBe(original);
    expect((await listChanges()).changes).toEqual([]);
    await expect(undoLastChange("Ben")).rejects.toThrow(/no approved editor change/);
  });

  it("will not undo a change when the same file has changed again since", async () => {
    const n = await sendChange({ author: "Ana", summary: "Raise a fee", documents: [await editNus()] });
    await approveChange(n, "Ben");
    github.commitToMain(NUS, original);
    await expect(undoLastChange("Ben")).rejects.toThrow(/changed again/);
  });

  describe("one sign-in, one approval", () => {
    type Tuition = { programmes: { fees: { international: { annualTuition: number } } }[] };
    /** Opens the file the way the edit screen does, raises the first programme's fee by 100, and returns the document to send. */
    async function raise(path: string, session: string) {
      const { documents } = await openForEditing([path], undefined, session);
      const data = structuredClone(documents[0].data) as Tuition;
      data.programmes[0].fees.international.annualTuition += 100;
      return { path, sha: documents[0].sha, data };
    }
    const tuition = (path: string) => (JSON.parse(github.filesAt("main").get(path)!) as Tuition).programmes[0].fees.international.annualTuition;

    it("adds every edit from one sign-in to the same change, so one approval publishes them all", async () => {
      const n = await sendChange({ author: "Ana", summary: "Raise NUS fee", documents: [await raise(NUS, "a")], session: "a" });
      expect((await openForEditing([NUS], undefined, "a")).joining).toMatchObject({ number: n, title: "Raise NUS fee" });
      // The same file again starts from the sitting's version, and a different file joins too.
      expect(await sendChange({ author: "Ana", summary: "Raise NUS again", documents: [await raise(NUS, "a")], session: "a" })).toBe(n);
      expect(await sendChange({ author: "Ana", summary: "Raise NTU fee", documents: [await raise(NTU, "a")], session: "a" })).toBe(n);

      const { changes } = await listChanges();
      expect(changes).toMatchObject([{ number: n, title: "Raise NUS fee and 2 more", author: "Ana" }]);
      const detail = await getChange(n);
      expect(detail.files.map((f) => f.path).sort()).toEqual([NTU, NUS]);
      expect(detail.notes.map((x) => x.kind)).toEqual(["added", "added"]);

      const before = (JSON.parse(original) as Tuition).programmes[0].fees.international.annualTuition;
      await approveChange(n, "Ana");
      expect(tuition(NUS)).toBe(before + 200);
      expect(await listVersions()).toMatchObject([{ number: n, author: "Ana" }]);

      // Once approved, the next edit starts a new change.
      const next = await sendChange({ author: "Ana", summary: "Raise NUS once more", documents: [await raise(NUS, "a")], session: "a" });
      expect(next).not.toBe(n);
    });

    it("keeps an earlier edit of the same file even while GitHub's file list is behind", async () => {
      const n = await sendChange({ author: "Ana", summary: "Raise NTU fee", documents: [await raise(NTU, "a")], session: "a" });
      // From here GitHub keeps reporting only NTU, so the NUS edits must be tracked another way.
      github.staleFiles = true;
      await sendChange({ author: "Ana", summary: "Raise NUS fee", documents: [await raise(NUS, "a")], session: "a" });
      expect(await sendChange({ author: "Ana", summary: "Raise NUS again", documents: [await raise(NUS, "a")], session: "a" })).toBe(n);
      github.staleFiles = false;
      const before = (JSON.parse(original) as Tuition).programmes[0].fees.international.annualTuition;
      await approveChange(n, "Ana");
      expect(tuition(NUS)).toBe(before + 200);
      expect(tuition(NTU)).toBe((JSON.parse(fs.readFileSync(NTU, "utf8")) as Tuition).programmes[0].fees.international.annualTuition + 100);
    });

    it("keeps different sign-ins apart, and blocks two of them editing the same file", async () => {
      const a = await sendChange({ author: "Ana", summary: "Raise NUS fee", documents: [await raise(NUS, "a")], session: "a" });
      const b = await sendChange({ author: "Ben", summary: "Raise NTU fee", documents: [await raise(NTU, "b")], session: "b" });
      expect(b).not.toBe(a);
      const { documents, joining, waiting } = await openForEditing([NUS], undefined, "b");
      expect(joining).toMatchObject({ number: b });
      expect(waiting).toMatchObject([{ number: a }]);
      await expect(sendChange({ author: "Ben", summary: "Raise NUS too", documents, session: "b" })).rejects.toThrow(/already waiting/);
    });

    it("does not add to a change that was sent back", async () => {
      const a = await sendChange({ author: "Ana", summary: "Raise NUS fee", documents: [await raise(NUS, "a")], session: "a" });
      await sendBackChange(a, "Ben", "Check the figure");
      expect((await openForEditing([NTU], undefined, "a")).joining).toBeNull();
      const other = await sendChange({ author: "Ana", summary: "Raise NTU fee", documents: [await raise(NTU, "a")], session: "a" });
      expect(other).not.toBe(a);
    });
  });
});
