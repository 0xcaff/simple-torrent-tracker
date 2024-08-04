import { parseQueryStringValue } from "./parseQueryString/parseQueryString";
import { intoHex, tryExtractNumber } from "./bencode";

export function parseAnnounceRequestArgs(queryParams: Map<string, string>) {
  const encodedInfoHash = queryParams.get("info_hash");

  if (!encodedInfoHash) {
    return failure("missing info_hash");
  }

  const infoHashDecoded = parseQueryStringValue(encodedInfoHash);
  if (infoHashDecoded.length !== 20) {
    return failure("invalid info_hash length");
  }

  const infoHash = intoHex(infoHashDecoded);

  const peerId = queryParams.get("peer_id");
  if (!peerId) {
    return failure("missing peer_id");
  }

  if (peerId.length !== 20) {
    return failure("invalid peer_id length");
  }

  const port = tryExtractNumber(queryParams.get("port") ?? null);
  if (!port) {
    return failure("missing port");
  }

  const uploaded = tryExtractNumber(queryParams.get("uploaded") ?? null) ?? 0;

  const downloaded =
    tryExtractNumber(queryParams.get("downloaded") ?? null) ?? 0;

  const left = tryExtractNumber(queryParams.get("left") ?? null) ?? 0;

  const event = queryParams.get("event") ?? null;

  const ip = queryParams.get("ip") ?? null;

  return {
    type: "SUCCESS" as const,
    values: {
      peerId,
      infoHash,
      event,
      ip,
      port,
      uploaded,
      downloaded,
      left,
    },
  };
}

function failure(reason: string) {
  return {
    type: "FAILURE" as const,
    reason,
  };
}
