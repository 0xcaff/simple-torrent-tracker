type BencodableValue = number | string | BencodableValue[] | { [key: string]: BencodableValue };

function bencode(data: BencodableValue): string {
	if (typeof data === 'number') {
		return `i${data}e`;
	} else if (typeof data === 'string') {
		return `${data.length}:${data}`;
	} else if (Array.isArray(data)) {
		return `l${data.map(bencode).join('')}e`;
	} else if (typeof data === 'object') {
		const encoded = Object.keys(data)
			.sort()
			.map((key) => `${bencode(key)}${bencode(data[key])}`)
			.join('');
		return `d${encoded}e`;
	} else {
		throw new Error('invalid data type');
	}
}

type PeerStateArgs = {
	ip: string;
	port: number;
	uploaded: number;
	downloaded: number;
	left: number;
};

type PeerStateStored = PeerStateArgs & {
	lastAnnounce: number;
};

export class TorrentState implements DurableObject {
	private storage: DurableObjectStorage;
	private state: DurableObjectState;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.storage = state.storage;
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const params = url.searchParams;

		const peerId = params.get('peer_id');
		const port = parseInt(params.get('port')!!);
		const uploaded = parseInt(params.get('uploaded')!!);
		const downloaded = parseInt(params.get('downloaded')!!);
		const left = parseInt(params.get('left')!!);
		const event = params.get('event')!!;

		if (!peerId || isNaN(port)) {
			return new Response('Invalid request', { status: 400 });
		}

		const ip = request.headers.get('cf-connecting-ip')!;

		await this.updatePeer(peerId, { ip, port, uploaded, downloaded, left });

		await this.cleanupPeers();

		const peerList = await this.getPeerList();

		const response = {
			interval: 1800,
			peers: peerList,
		};

		const encodedResponse = bencode(response);

		return new Response(encodedResponse, {
			headers: { 'Content-Type': 'text/plain' },
		});
	}

	async updatePeer(peerId: string, data: PeerStateArgs) {
		await this.storage.put<PeerStateStored>(peerId, {
			...data,
			lastAnnounce: Date.now(),
		});
	}

	async cleanupPeers() {
		const now = Date.now();
		for (const [key, peer] of await this.storage.list<PeerStateStored>()) {
			if (now - peer.lastAnnounce > 30 * 60 * 1000) {
				await this.storage.delete(key);
			}
		}
	}

	async getPeerList(): Promise<PeerStateStored[]> {
		const stored = await this.storage.list<PeerStateStored>({
			limit: 50,
		});
		return Array.from(stored.values());
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const infoHash = url.searchParams.get('info_hash');

		if (!infoHash) {
			return new Response('Invalid request', { status: 400 });
		}

		// Get Durable Object stub
		const id = env.TORRENT_STATE.idFromName(infoHash);
		const tracker = env.TORRENT_STATE.get(id);

		// Forward request to Durable Object
		return tracker.fetch(request);
	},
} satisfies ExportedHandler<Env>;
