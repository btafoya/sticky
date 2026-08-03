import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup?version=3.0";

import { INote, Note } from "./util.js";

Gio._promisify(
  Soup.Session.prototype,
  "send_and_read_async",
  "send_and_read_finish",
);

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export type RemoteNote = Omit<INote, "modified"> & {
  modified: string;
};

export class SyncError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`sync failed: ${status} ${body}`);
  }
}

export class SyncClient {
  private session = new Soup.Session();

  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private authHeader() {
    const creds = encoder.encode(`sticky:${this.apiKey}`);
    return `Basic ${GLib.base64_encode(creds)}`;
  }

  private request(method: string, url: string, body?: string): Soup.Message {
    const message = Soup.Message.new(method, url);
    if (!message) throw new Error(`failed to create request for ${url}`);

    message.request_headers.append("Authorization", this.authHeader());
    if (body) {
      message.set_request_body_from_bytes(
        "application/json",
        new GLib.Bytes(encoder.encode(body)),
      );
    }
    return message;
  }

  private async send(message: Soup.Message): Promise<string> {
    const bytes = await this.session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      null,
    );
    const text = decoder.decode(bytes.toArray());

    if (message.status_code >= 400) {
      throw new SyncError(message.status_code, text);
    }
    return text;
  }

  async getNotes(): Promise<RemoteNote[]> {
    const message = this.request("GET", `${this.baseUrl}/notes`);
    const text = await this.send(message);
    if (!text) return [];
    return JSON.parse(text);
  }

  async pushNote(note: INote): Promise<void> {
    const message = this.request(
      "POST",
      `${this.baseUrl}/notes`,
      JSON.stringify(note),
    );
    message.request_headers.append("Prefer", "resolution=merge-duplicates");
    await this.send(message);
  }

  async deleteNote(uuid: string): Promise<void> {
    const message = this.request(
      "DELETE",
      `${this.baseUrl}/notes?uuid=eq.${encodeURIComponent(uuid)}`,
    );
    await this.send(message);
  }
}

export function remoteToNote(remote: RemoteNote): Note {
  return new Note({
    v: remote.v,
    uuid: remote.uuid,
    content: remote.content,
    title: remote.title,
    style: remote.style,
    tags: remote.tags,
    modified: new Date(remote.modified),
    width: remote.width,
    height: remote.height,
    open: remote.open ?? false,
  });
}
