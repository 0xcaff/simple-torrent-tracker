import * as http from 'node:http';
import { parseQueryString } from './parseQueryString/parseQueryString';
import { parseAnnounceRequestArgs } from './parseAnnounceRequestArgs';
import { bencode } from './bencode';
import { run } from 'micro';
import URL from 'node:url';

export async function main() {
	const server = http.createServer((req, res) => {
		run(req, res, handle)
	})

	server.listen(3030);
}

function handle(req: http.IncomingMessage) {
	const url = URL.parse(req.url!, false, true);

	const queryParams = parseQueryString(url.search?.slice(1) ?? '');
	const result = parseAnnounceRequestArgs(queryParams);

	if (result.type === "FAILURE") {
		return bencode({
			"failure reason": result.reason,
		});
	}

	const peers = [{
		ip: '192.168.1.105',
		port: 6881,
		trash: 'abc'
	}];

	return bencode({
		interval: 1800,
		peers,
	})
}

main();
