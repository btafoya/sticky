import Gio from "gi://Gio";
import GLib from "gi://GLib";

import {
  delete_note,
  ensure_dir,
  load_file,
  load_notes,
  NewNotesDir,
  save_file,
  save_note,
} from "./store.js";
import { INote, Note } from "./util.js";
import { remoteToNote, SyncClient, SyncError } from "./sync.js";

const SyncStateFile = Gio.file_new_for_path(
  GLib.build_filenamev([NewNotesDir.get_path()!, "sync-state.json"]),
);

interface SyncState {
  lastSync: string | null;
  pendingDeletes: string[];
}

function loadState(): SyncState {
  try {
    const data = load_file(SyncStateFile) as SyncState;
    return {
      lastSync: data.lastSync ?? null,
      pendingDeletes: data.pendingDeletes ?? [],
    };
  } catch {
    return { lastSync: null, pendingDeletes: [] };
  }
}

function saveState(state: SyncState) {
  ensure_dir(NewNotesDir);
  save_file(SyncStateFile, state);
}

export class SyncQueue {
  private client: SyncClient;
  private state: SyncState;
  private pendingPushes = new Map<string, INote>();
  private timer: number | null = null;
  private running = false;
  private consecutiveErrors = 0;

  constructor(
    baseUrl: string,
    apiKey: string,
    private intervalSeconds: number,
    private onNotesChanged?: (
      remoteNotes: import("./sync.js").RemoteNote[],
      deletedUuids: string[],
    ) => void,
  ) {
    this.client = new SyncClient(baseUrl, apiKey);
    this.state = loadState();
  }

  push(note: Note) {
    this.pendingPushes.set(note.uuid, note.toJSON());
    this.state.pendingDeletes = this.state.pendingDeletes.filter(
      (uuid) => uuid !== note.uuid,
    );
    this.schedule(2000);
  }

  delete(uuid: string) {
    if (!this.state.pendingDeletes.includes(uuid)) {
      this.state.pendingDeletes.push(uuid);
    }
    this.pendingPushes.delete(uuid);
    this.schedule(2000);
  }

  syncNow() {
    this.schedule(0);
  }

  stop() {
    if (this.timer) {
      GLib.source_remove(this.timer);
      this.timer = null;
    }
  }

  flush() {
    this.stop();
    if (this.running) return;
    this.run();
  }

  private schedule(delayMs: number) {
    if (this.running) return;
    if (this.timer) GLib.source_remove(this.timer);

    this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
      this.timer = null;
      this.run();
      return GLib.SOURCE_REMOVE;
    });
  }

  private async run() {
    if (this.running) return;
    this.running = true;

    try {
      await this.sync();
      this.consecutiveErrors = 0;
      this.schedule(this.intervalSeconds * 1000);
    } catch (error) {
      this.consecutiveErrors++;
      const delay = Math.min(5000 * 2 ** this.consecutiveErrors, 300000);
      this.schedule(delay);

      const detail = error instanceof SyncError
        ? `${error.status} ${error.body}`
        : String(error);
      console.error(`sync failed, retrying in ${delay}ms:`, detail);
    } finally {
      this.running = false;
    }
  }

  private async sync() {
    const remoteNotes = await this.client.getNotes();
    const remoteByUuid = new Map(remoteNotes.map((n) => [n.uuid, n]));

    const lastSync = this.state.lastSync ? new Date(this.state.lastSync) : null;
    const now = new Date();

    // Push dirty local notes (upsert is idempotent, so partial failures are safe to retry)
    for (const note of this.pendingPushes.values()) {
      if (!lastSync || note.modified > lastSync) {
        await this.client.pushNote(note);
      }
    }

    // Send pending deletions
    for (const uuid of this.state.pendingDeletes) {
      await this.client.deleteNote(uuid);
    }

    this.pendingPushes.clear();
    this.state.pendingDeletes = [];

    // Pull: merge remote notes into local storage
    const localNotes = new Map(load_notes().map((note) => [note.uuid, note]));

    for (const remote of remoteNotes) {
      const local = localNotes.get(remote.uuid);
      const remoteModified = new Date(remote.modified);
      if (local) {
        if (remoteModified > local.modified_date) {
          save_note(remoteToNote(remote));
        }
      } else if (!lastSync || remoteModified >= lastSync) {
        save_note(remoteToNote(remote));
      }
    }

    // Delete local notes that were removed remotely after they were synced
    const deletedUuids: string[] = [];
    for (const [uuid, local] of localNotes) {
      if (!remoteByUuid.has(uuid) && lastSync && local.modified_date <= lastSync) {
        delete_note(uuid);
        deletedUuids.push(uuid);
      }
    }

    this.state.lastSync = now.toISOString();
    saveState(this.state);
    this.onNotesChanged?.(remoteNotes, deletedUuids);
  }
}
