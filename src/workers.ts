import { DurableObject } from "cloudflare:workers";
import { parseQueryString } from "./parse/parseQueryString";
import { bencode } from "./bencode";
import { extractArgs } from "./extractArgs";
import { DatadogLogger } from "./datadogLogger";

interface Env {
  TORRENT_STATE: DurableObjectNamespace<TorrentState>;
  DD_API_KEY?: string;
  ALLOWED_INFO_HASHES?: string;
  PATH_KEY?: string;
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

    const peerList = (await this.getPeerList()).filter(
      (it) => !(it.peerId == peerId && it.ip == ip && it.port == port),
    );

    return bencode({
      interval: 1800,
      peers: peerList.map((peer) => ({
        id: peer.peerId,
        ip: peer.ip,
        port: peer.port,
      })),
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

    if (env.PATH_KEY && !url.pathname.startsWith("/" + env.PATH_KEY)) {
      return new Response("not found", { status: 404 });
    }

    const pathname = (() => {
      if (env.PATH_KEY) {
        return url.pathname.slice(1 + env.PATH_KEY.length);
      } else {
        return url.pathname;
      }
    })();

    function isInAllowedInfoHashes(infoHash: string) {
      if (!env.ALLOWED_INFO_HASHES) {
        // Allow all by default
        return true;
      }

      return env.ALLOWED_INFO_HASHES.split(",").includes(infoHash);
    }

    if (pathname === "/announce") {
      const queryParams = parseQueryString(url.search.slice(1));
      const result = extractArgs(queryParams);

      if (result.type === "FAILURE") {
        return new Response(
          bencode({
            "failure reason": result.reason,
          }),
        );
      }

      if (!isInAllowedInfoHashes(result.values.infoHash)) {
        return new Response("not found", { status: 404 });
      }

      const values = {
        peerId: result.values.peerId,
        ip: result.values.ip ?? request.headers.get("cf-connecting-ip")!,
        port: result.values.port,
        uploaded: result.values.uploaded,
        downloaded: result.values.downloaded,
        left: result.values.left,
        event: result.values.event,
      }

      if (env.DD_API_KEY) {
        const logger = new DatadogLogger(env.DD_API_KEY);
        ctx.waitUntil(
          logger.log([
            {
              type: "announce",
              values,
            },
          ]),
        );
      }

      const id = env.TORRENT_STATE.idFromName(result.values.infoHash);
      const tracker = env.TORRENT_STATE.get(id);

      const response = await tracker.handleAnnounce(values);

      return new Response(response);
    } else {
      const infoHash = pathname.slice(1);
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
