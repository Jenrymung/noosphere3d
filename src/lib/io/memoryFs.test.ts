import { describe, expect, it } from "vitest";
import { createDisk, memorySave, memoryWriteRecovery } from "./memoryFs";

const newer = JSON.stringify({ format: "mindmap3d", version: "2.0", nodes: {} });

describe("memory save", () => {
  it("refuses a newer major file without changing its bytes or stamp", () => {
    const disk = createDisk();
    disk.files.set("/maps/future.mindmap3d", { text: newer, modifiedMs: 1000 });
    const result = memorySave(disk, {
      path: "/maps/future.mindmap3d",
      text: JSON.stringify({ version: "1.0" }),
      expected: { modifiedMs: 1000, len: newer.length },
      rotateBackup: true,
      backupKeep: 5,
      now: 5000,
    });
    expect(result.kind).toBe("newer-major");
    expect(disk.files.get("/maps/future.mindmap3d")).toEqual({ text: newer, modifiedMs: 1000 });
    expect(disk.backups.get("/maps/future.mindmap3d")).toBeUndefined();
    const recovery = memoryWriteRecovery(
      disk,
      { id: "r1", savedAt: "2026-10-20T00:00:00.000Z", title: "Future", path: "/maps/future.mindmap3d", mapText: "{}" },
      "/maps/future.mindmap3d",
    );
    expect(recovery.kind).toBe("newer-major");
    expect(disk.recovery.size).toBe(0);
  });

  it("detects an external change and rotates only the requested backups", () => {
    const disk = createDisk();
    const first = memorySave(disk, {
      path: "/maps/a.mindmap3d",
      text: "{\"version\":\"1.0\"}",
      expected: null,
      rotateBackup: false,
      backupKeep: 2,
      now: 10,
    });
    expect(first.kind).toBe("ok");
    disk.files.set("/maps/a.mindmap3d", { text: "external", modifiedMs: 99 });
    const blocked = memorySave(disk, {
      path: "/maps/a.mindmap3d",
      text: "mine",
      expected: { modifiedMs: 10, len: "{\"version\":\"1.0\"}".length },
      rotateBackup: true,
      backupKeep: 2,
      now: 200,
    });
    expect(blocked.kind).toBe("external-change");
    expect(disk.files.get("/maps/a.mindmap3d")?.text).toBe("external");

    const disk2 = createDisk();
    memorySave(disk2, { path: "/m", text: "a", expected: null, rotateBackup: false, backupKeep: 2, now: 1 });
    memorySave(disk2, { path: "/m", text: "b", expected: { modifiedMs: 1, len: 1 }, rotateBackup: true, backupKeep: 2, now: 2 });
    memorySave(disk2, { path: "/m", text: "c", expected: { modifiedMs: 2, len: 1 }, rotateBackup: true, backupKeep: 2, now: 3 });
    memorySave(disk2, { path: "/m", text: "d", expected: { modifiedMs: 3, len: 1 }, rotateBackup: true, backupKeep: 2, now: 4 });
    expect(disk2.backups.get("/m")?.map((file) => file.text)).toEqual(["b", "c"]);
    expect(disk2.files.get("/m")?.text).toBe("d");
  });
});
