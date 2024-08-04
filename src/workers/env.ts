import { TorrentState } from "./state";

export interface Env {
  // Optional Datadog API Key. When provided, logs announces to DataDog.
  DD_API_KEY?: string;

  // Optional comma separated list of lowercase info hashes for allowed
  // torrents. When omitted, allows all info hashes.
  ALLOWED_INFO_HASHES?: string;

  // Optional path prefix for requests for preventing unintended access to
  // tracker. When specified the announce URL becomes
  // https://example.com/$PATH_KEY/announce instead of the default
  // https://example.com/announce
  PATH_KEY?: string;

  TORRENT_STATE: DurableObjectNamespace<TorrentState>;
}
