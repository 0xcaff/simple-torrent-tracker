import { parseQueryString } from "../parseQueryString/parseQueryString";
import { parseAnnounceRequestArgs } from "../parseAnnounceRequestArgs";
import { bencode } from "../bencode";
import { Datadog } from "../datadog";
import { Env } from "./env";
import { TorrentState } from "./state";

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

      const normalizedInfoHash = infoHash.toLowerCase();

      return env.ALLOWED_INFO_HASHES.split(",").includes(normalizedInfoHash);
    }

    if (pathname === "/announce") {
      const queryParams = parseQueryString(url.search.slice(1));
      const result = parseAnnounceRequestArgs(queryParams);

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
      };

      if (env.DD_API_KEY) {
        const logger = new Datadog(env.DD_API_KEY);
        ctx.waitUntil(
          logger.log([
            {
              type: "announce",
              values: {
                ...values,
                infoHash: result.values.infoHash,
              },
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

export { TorrentState };
