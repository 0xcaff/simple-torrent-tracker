# simple-torrent-tracker

a simple bittorrent tracker built on cloudflare workers.

## quickstart

```
$ yarn
$ wrangler deploy
```

your tracker will be available at https://your-namespace.workers.dev/announce.
for available configuration, see [env.ts](./src/workers/env.ts). visit
`https://your-namespace.workers.dev/<your_info_hash>` (for example
https://your-namespace.workers.dev/7dc755c011ce937629d2227de6b6b1ee83222437) to
see a json representation of the peer list.

## logging

add a `DD_API_KEY` secret with a value containing an
[api key from datadog][keys] to enable logging announces to datadog. this allows
you to see all peers and info hashes the tracker is coordinating peer discovery
for.

## why

the bittorrent protocol is a tool for handling p2p transfers in a fault-tolerant
way. it is useful when peers have poor link quality and transfer sizes are
large. for bittorrent peers to exchange data, they first need to discover
each other. private trackers facilitate peer discovery by providing a private
and shared coordination point so torrent metadata can be shared only with a
select set of peers rather than all peers in the bittorrent network.

this is a tool to set up a simple private tracker. its deployed on cloudflare
workers, making it be easy to deploy and monitor.

i'm releasing this to understand how folks are using the torrent protocol for
private p2p transfers (non-piracy use cases). i'm open to PRs, issues and other
feedback. this is close to being useful for you but doesn't fit your use case?
looking for a feature this doesn't have (per-user auth, per-user metering,
something else)? open an issue, i'd like to hear from you.

[keys]: https://docs.datadoghq.com/account_management/api-app-keys/