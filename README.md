# simple-torrent-tracker

a super simple bittorrent tracker built on cloudflare workers.

## quickstart

```
$ yarn
$ wrangler deploy
```

your tracker will be available at https://your-namespace.workers.dev/announce.
See [env.ts](./src/workers/env.ts) for available configuration.

## why

the bittorrent protocol is a great tool for handling p2p transfers in a
fault-tolerant way. this is useful if your peers have poor link quality and your
datasets are large. trackers are one of the mechanisms bittorrent uses for peer
discovery, especially with private torrents.

this is a tool to stand up a simple private tracker which you control without
spending a large part of your mental budget on the operational complexity on
hosting.

i'm releasing this to understand how folks are using the torrent protocol for
private p2p transfers. i'm open to PRs, issues and other feedback. this is close
to being useful for you but doesn't fit your use case? open an issue, i'd like
to hear from you
