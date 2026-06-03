/**
 * Snapshot sink abstraction.
 *
 * The pipeline writes the verified graph through a SnapshotSink so the storage
 * backend is swappable (local file today; object storage / KV later) without
 * touching ingestion logic. The contract guarantees the game NEVER loads a
 * half-written snapshot: write to a temp location, validate, then atomically
 * promote to the live key.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphSnapshot } from "../types.js";
import { SNAPSHOT_DIR, SNAPSHOT_FILE } from "../config.js";

export interface SnapshotSink {
  /** Read the current live snapshot, or null if none exists yet. */
  readLatest(): Promise<GraphSnapshot | null>;
  /**
   * Persist a validated snapshot atomically.
   * Implementations must write to a temp location and promote only on success.
   */
  promote(snapshot: GraphSnapshot): Promise<void>;
}

/** Local-filesystem sink: data/snapshot.json with a temp-then-rename promote. */
export class FileSnapshotSink implements SnapshotSink {
  constructor(
    private readonly dir: string = SNAPSHOT_DIR,
    private readonly file: string = SNAPSHOT_FILE,
  ) {}

  private get livePath() {
    return join(this.dir, this.file);
  }

  async readLatest(): Promise<GraphSnapshot | null> {
    if (!existsSync(this.livePath)) return null;
    try {
      return JSON.parse(readFileSync(this.livePath, "utf8")) as GraphSnapshot;
    } catch {
      return null;
    }
  }

  async promote(snapshot: GraphSnapshot): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    const tmpPath = join(this.dir, `${this.file}.tmp.json`);
    // Pretty-print is fine; the file is read once at build/runtime, not per-move.
    writeFileSync(tmpPath, JSON.stringify(snapshot, null, 0), "utf8");
    // rename is atomic on POSIX within the same filesystem.
    renameSync(tmpPath, this.livePath);
  }
}

/**
 * Choose a sink from env. Defaults to the file sink. To add a KV/object-store
 * sink later, implement SnapshotSink and branch here on e.g. SNAPSHOT_SINK=kv.
 */
export function getSink(): SnapshotSink {
  // const which = process.env.SNAPSHOT_SINK ?? "file";
  return new FileSnapshotSink();
}
