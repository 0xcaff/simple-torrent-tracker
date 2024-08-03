import { DurableObject } from "cloudflare:workers";
import { bencode } from "../bencode";

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
