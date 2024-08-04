import { it, expect } from "vitest";
import {
  parseQueryString,
  parseQueryStringValue,
} from "./parseQueryString/parseQueryString";
import { intoHex } from "./bencode";
import { parseAnnounceRequestArgs } from "./parseAnnounceRequestArgs";

it("parses a query string into its constituent parts", () => {
  expect(
    parseQueryString(
      "info_hash=%E1%B8m%C6%5E%1A%11%DE%16%90%1F%26%98%82%80r%40%C1%7Fr&peer_id=-TR4050-x4apaio8s299&port=51413&uploaded=0&downloaded=0&left=278672696&numwant=80&key=0A850B43&compact=1&supportcrypto=1&event=started",
    ),
  ).toMatchInlineSnapshot(`
		Map {
		  "info_hash" => "%E1%B8m%C6%5E%1A%11%DE%16%90%1F%26%98%82%80r%40%C1%7Fr",
		  "peer_id" => "-TR4050-x4apaio8s299",
		  "port" => "51413",
		  "uploaded" => "0",
		  "downloaded" => "0",
		  "left" => "278672696",
		  "numwant" => "80",
		  "key" => "0A850B43",
		  "compact" => "1",
		  "supportcrypto" => "1",
		  "event" => "started",
		}
	`);
});

it("parses a query string value", () => {
  const encoded = intoHex(
    parseQueryStringValue(
      "%E1%B8m%C6%5E%1A%11%DE%16%90%1F%26%98%82%80r%40%C1%7Fr",
    ),
  );
  expect(encoded).toMatchInlineSnapshot(
    `"e1b86dc65e1a11de16901f269882807240c17f72"`,
  );
});

it("extracts", () => {
  expect(
    parseAnnounceRequestArgs(
      parseQueryString(
        "info_hash=%E1%B8m%C6%5E%1A%11%DE%16%90%1F%26%98%82%80r%40%C1%7Fr&peer_id=-TR4050-x4apaio8s299&port=51413&uploaded=0&downloaded=0&left=278672696&numwant=80&key=0A850B43&compact=1&supportcrypto=1&event=started",
      ),
    ),
  ).toMatchInlineSnapshot(`
    {
      "type": "SUCCESS",
      "values": {
        "downloaded": 0,
        "event": "started",
        "infoHash": "e1b86dc65e1a11de16901f269882807240c17f72",
        "ip": null,
        "left": 278672696,
        "peerId": "-TR4050-x4apaio8s299",
        "port": 51413,
        "uploaded": 0,
      },
    }
  `);
});
