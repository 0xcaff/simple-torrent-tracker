import * as p from './parse';

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

		if (url.pathname == '/') {
			const peerId = params.get('peer_id');
			if (!peerId) {
				return new Response(
					bencode({
						'failure code': 102,
					}),
				);
			}

			if (peerId.length !== 20) {
				return new Response(
					bencode({
						'failure code': 151,
					}),
				);
			}

			const port = tryExtractNumber(params.get('port'));
			if (!port) {
				return new Response(
					bencode({
						'failure code': 103,
					}),
				);
			}

			const uploaded = tryExtractNumber(params.get('uploaded')) ?? 0;
			const downloaded = tryExtractNumber(params.get('downloaded')) ?? 0;
			const left = tryExtractNumber(params.get('left')) ?? 0;
			const event = params.get('event');

			const ip = params.get('ip') ?? request.headers.get('cf-connecting-ip')!;

			await this.updatePeer(peerId, { ip, port, uploaded, downloaded, left }, event);

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
		} else {
			return new Response(JSON.stringify(await this.getPeerList()));
		}
	}

	async updatePeer(peerId: string, data: PeerStateArgs, event: string | null) {
		if (event === 'stopped') {
			await this.storage.delete(peerId);
			return;
		}

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
		const params = parseQueryString(url.search.slice(1));

		if (url.pathname === '/') {
			const encodedInfoHash = params.get('info_hash');

			if (!encodedInfoHash) {
				return new Response(
					bencode({
						'failure code': 101,
					}),
				);
			}

			const infoHashDecoded = parseQueryStringValue(encodedInfoHash);
			if (infoHashDecoded.length !== 20) {
				return new Response(
					bencode({
						'failure code': 150,
					}),
				);
			}

			const infoHash = intoHex(infoHashDecoded);

			const id = env.TORRENT_STATE.idFromName(infoHash);
			const tracker = env.TORRENT_STATE.get(id);

			return tracker.fetch(request);
		} else {
			const infoHash = url.pathname.slice(1);
			if (infoHash.length != 40) {
				return new Response('invalid info hash', { status: 400 });
			}

			const id = env.TORRENT_STATE.idFromName(infoHash.toLowerCase());
			const tracker = env.TORRENT_STATE.get(id);

			return tracker.fetch(request);
		}
	},
} satisfies ExportedHandler<Env>;

export function intoHex(array: Uint8Array) {
	return [...array].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseQueryStringValue(queryString: string): Uint8Array {
	const result = p.parseRepeated(
		p.alt(
			p.map(
				p.sequence(
					p.tag('%'),
					p.takeExactly(
						2,
						p.parseMatching((input) => /[0-9a-fA-F]/.test(input)),
					),
				),
				([_, char]) => parseInt(char.join(''), 16),
			),
			p.map(
				p.parseMatching(
					(char) => !['!', '*', "'", '(', ')', ';', ':', '@', '&', '=', '+', '$', ',', '/', '?', '#', '[', ']'].includes(char),
				),
				(char) => char.charCodeAt(0),
			),
		),
	)(queryString);

	if (!result || result.remaining.length > 0) {
		throw new Error('invalid query string');
	}

	return new Uint8Array(result.value);
}

export function parseQueryString(queryString: string): Map<string, string> {
	const params = new Map<string, string>();
	const pairs = queryString.split('&');
	for (const pair of pairs) {
		const [key, value] = pair.split('=');
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
