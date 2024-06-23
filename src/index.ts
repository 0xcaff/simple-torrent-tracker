import { DurableObject } from "cloudflare:workers";

import * as p from "./parse";

interface Env {
  TORRENT_STATE: DurableObjectNamespace<TorrentState>;
  DD_API_KEY?: string;
  ALLOWED_INFO_HASHES?: string;
}

type PeerStateArgs = {
  peerId: string;
  ip: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
};

type PeerStateStored = PeerStateArgs & {
  lastAnnounce: number;
};

type AnnounceArguments = {
  peerId: string;
  ip: string;
  port: number;
  event: string | null;
  uploaded: number;
  downloaded: number;
  left: number;
};

export class TorrentState extends DurableObject {
  async handleAnnounce({
    peerId,
    ip,
    port,
    event,
    uploaded,
    downloaded,
    left,
  }: AnnounceArguments) {
    await this.updatePeer(
      peerId,
      { peerId, ip, port, uploaded, downloaded, left },
      event,
    );

    await this.cleanupPeers();

    const peerList = await this.getPeerList();

    return bencode({
      interval: 1800,
      peers: peerList,
    });
  }

  async updatePeer(peerId: string, data: PeerStateArgs, event: string | null) {
    if (event === "stopped") {
      await this.ctx.storage.delete(peerId);
      return;
    }

    await this.ctx.storage.put<PeerStateStored>(peerId, {
      ...data,
      lastAnnounce: Date.now(),
    });
  }

  async cleanupPeers() {
    const now = Date.now();
    for (const [key, peer] of await this.ctx.storage.list<PeerStateStored>()) {
      if (now - peer.lastAnnounce > 30 * 60 * 1000) {
        await this.ctx.storage.delete(key);
      }
    }
  }

  async getPeerList(): Promise<PeerStateStored[]> {
    const stored = await this.ctx.storage.list<PeerStateStored>({
      limit: 50,
    });
    return Array.from(stored.values());
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    function isInAllowedInfoHashes(infoHash: string) {
      if (!env.ALLOWED_INFO_HASHES) {
        // Allow all by default
        return true;
      }

      return env.ALLOWED_INFO_HASHES.split(",").includes(infoHash);
    }

    if (url.pathname === "/") {
      const params = parseQueryString(url.search.slice(1));

      const encodedInfoHash = params.get("info_hash");

      if (!encodedInfoHash) {
        return new Response(
          bencode({
            "failure code": 101,
          }),
        );
      }

      const infoHashDecoded = parseQueryStringValue(encodedInfoHash);
      if (infoHashDecoded.length !== 20) {
        return new Response(
          bencode({
            "failure code": 150,
          }),
        );
      }

      const infoHash = intoHex(infoHashDecoded);
      if (!isInAllowedInfoHashes(infoHash)) {
        return new Response(
          bencode({
            "failure code": 200,
          }),
        );
      }

      const peerId = params.get("peer_id");
      if (!peerId) {
        return new Response(
          bencode({
            "failure code": 102,
          }),
        );
      }

      if (peerId.length !== 20) {
        return new Response(
          bencode({
            "failure code": 151,
          }),
        );
      }

      const port = tryExtractNumber(params.get("port") ?? null);
      if (!port) {
        return new Response(
          bencode({
            "failure code": 103,
          }),
        );
      }

      const uploaded = tryExtractNumber(params.get("uploaded") ?? null) ?? 0;
      const downloaded =
        tryExtractNumber(params.get("downloaded") ?? null) ?? 0;
      const left = tryExtractNumber(params.get("left") ?? null) ?? 0;
      const event = params.get("event") ?? null;

      const ip = params.get("ip") ?? request.headers.get("cf-connecting-ip")!;

      if (env.DD_API_KEY) {
        const logger = new DatadogLogger(env.DD_API_KEY);
        ctx.waitUntil(
          logger.log([
            {
              type: "announce",
              values: {
                infoHash,
                ip,
                port,
                uploaded,
                downloaded,
                left,
              },
            },
          ]),
        );
      }

      const id = env.TORRENT_STATE.idFromName(infoHash);
      const tracker = env.TORRENT_STATE.get(id);

      const response = await tracker.handleAnnounce({
        peerId,
        ip,
        port,
        uploaded,
        downloaded,
        left,
        event,
      });

      return new Response(response);
    } else {
      const infoHash = url.pathname.slice(1);
      if (infoHash.length != 40) {
        return new Response("not found", { status: 404 });
      }

      if (!isInAllowedInfoHashes(infoHash)) {
        return new Response("not found", { status: 404 });
      }

      const id = env.TORRENT_STATE.idFromName(infoHash.toLowerCase());
      const tracker = env.TORRENT_STATE.get(id);

      return new Response(JSON.stringify(await tracker.getPeerList()));
    }
  },
} satisfies ExportedHandler<Env>;

export function intoHex(array: Uint8Array) {
  return [...array].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseQueryStringValue(queryString: string): Uint8Array {
  const result = p.parseRepeated(
    p.alt(
      p.map(
        p.sequence(
          p.tag("%"),
          p.takeExactly(
            2,
            p.parseMatching((input) => /[0-9a-fA-F]/.test(input)),
          ),
        ),
        ([_, char]) => parseInt(char.join(""), 16),
      ),
      p.map(
        p.parseMatching(
          (char) =>
            ![
              "!",
              "*",
              "'",
              "(",
              ")",
              ";",
              ":",
              "@",
              "&",
              "=",
              "+",
              "$",
              ",",
              "/",
              "?",
              "#",
              "[",
              "]",
            ].includes(char),
        ),
        (char) => char.charCodeAt(0),
      ),
    ),
  )(queryString);

  if (!result || result.remaining.length > 0) {
    throw new Error("invalid query string");
  }

  return new Uint8Array(result.value);
}

export function parseQueryString(queryString: string): Map<string, string> {
  const params = new Map<string, string>();
  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key && value) {
      params.set(decodeURIComponent(key), value);
    }
  }
  return params;
}

function tryExtractNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = parseInt(value);
  if (!(parsedValue >= 0)) {
    return null;
  }

  return parsedValue;
}

type BencodableValue =
  | number
  | string
  | BencodableValue[]
  | { [key: string]: BencodableValue };

function bencode(data: BencodableValue): string {
  if (typeof data === "number") {
    return `i${data}e`;
  } else if (typeof data === "string") {
    return `${data.length}:${data}`;
  } else if (Array.isArray(data)) {
    return `l${data.map(bencode).join("")}e`;
  } else if (typeof data === "object") {
    const encoded = Object.keys(data)
      .sort()
      .map((key) => `${bencode(key)}${bencode(data[key])}`)
      .join("");
    return `d${encoded}e`;
  } else {
    throw new Error("invalid data type");
  }
}

class DatadogLogger {
  constructor(private apiKey: string) {}

  async log(messages: any[]) {
    const url = `https://http-intake.logs.datadoghq.com/api/v2/logs`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": this.apiKey,
      },
      body: JSON.stringify(
        messages.map((message) => ({
          message,
          hostname: "cloudflare",
          service: "tracker",
          ddtags: "env:prod",
        })),
      ),
    });
  }
}
