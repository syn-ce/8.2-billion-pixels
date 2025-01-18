# 8.2 Billion Pixels

![Screenshot of the website. "8.2 Billion Pixels" has been written as pixel art on the canvas in various pastel colors](/imgs/example_screenshot.png)

Reddit's 2023 r/place consisted of 6 Million individual pixels. As of writing this there are ~8.2 Billion humans on earth - way too many for everyone to get a spot on the canvas! So let's build a place for everyone.

Try it yourself: [click me](https://bipix.m-amthor.com)

Note that this project is still **in development**. In particular, [here](#known-issues--todos--ideas)'s a list of known issues, todos and ideas that are yet to be adressed / considered. Same goes for this (atm very minimal) README; I'll add to it in the process.

## Architecture

This is the general setup. Since Traefik already proxies my server, I've decided to integrate with that and spin the services up in a Docker Swarm.

![Traefik in front of a Docker Swarm, with nginx serving static content and Go (Golang) processing updates and storing data in redis, publishing events via pubsub. Diagram made using https://www.tldraw.com/](/imgs/architecture_overview_dark.png)

## How to synchronize 8.2 Billion pixels

The key insight is that of all these pixels, only a fraction of them is visible at any given time for any one client. Even with a 4k monitor, only a little more than 0.1% (~8 Million pixels) of all pixels will be visible.

It is therefore natural to split the actual canvas up into logical _sections_ of size, let's say, 1000x1000 pixels. (Varying this size and maybe even adjusting it dynamically based on, e.g., server load, could potentially be a very interesting undertaking!) With 1 Million pixels each, we get a little more than 8000 of these logical square sections. A client will then simply only fetch the data of the sections which are currently visible to it (potentially with a bit of buffering as to avoid frequent reloads at edges of sections), and similarly subscribe to only these as well.

A client will then fetch the whole array of data for any section which comes into view and then subscribe to it to get notified about pixels being placed in it.

#### [To be continued]

## Known Issues / TODOs / Ideas

-   [ ] When using Firefox on a mobile device, the position of the reticle will not properly match the canvas, leading to a very unsatisfying user experience. If you have an idea what could cause this, here's a [related stackoverflow post](https://stackoverflow.com/questions/79057124/canvas-content-escapes-canvas-on-mobile-in-firefox). Similarly, the reticle's outline isn't properly clipped. In other browsers and on desktop this problem does not occur.
-   [ ] The UI sometimes gets messed up, especially on reloads. This issue arises because of the different ways in which browsers report viewport heights and is likely exacerbated by some hacky CSS.
-   [ ] In general, there are still some bugs around, e.g., sometimes the reticle escapes the logical canvas (that is, it hovers over a pixel "out of bounds" that cannot be set). It needs some polishing.
-   [x] ~~While the fetching of and subscribing to sections basically works, no buffering (be it in space or time) is implemented, meaning as soon as a section goes out of view the client unsubscribes, forgets about it and has to request it again once it reenters the view.~~ There is now a simple (spatial) buffer implemented which prevents unsubscribing from sections which are only barely outside the canvas (thereby preventing frequent reloads of the same section when it's currently at the edge of the canvas).
-   [ ] The zoom levels are restricted to whole integers. Especially on mobile this can feel awkward. Fixing this should be straightforward (it was initially introduced to avoid fractional offsets; working with exact values in the background and rounding them to, say, 2 decimals when applying should have potential to work)
-   [ ] Currently there's no manual synchronization happening. Instead, both the server and the client rely on events arriving in the order in which they were dispatched. Since this is not guaranteed (especially considering the variety in latencies from clients to the server), adding timestamps to the events will be necessary.
-   [ ] At the moment, no dynamic updating of the database (such as number / dimensions of sections, number of bits per color) is possible.
-   [ ] The 2-day-migration from Flask to Go leaves desirie for a cleanup.
-   [ ] The loading times will have to be improved substantially. Despite a hardware upgrade (it's currently running on a rather old, wirelessly connected specimen) one could look into compression algorithms (Update: Now using basic [LZ4 compression](https://github.com/lz4/lz4) for the section data as a first step in this direction).
-   [ ] The client doesn't yet detect websocket-disconnects and therefore doesn't attempt to reconnect when the connection has been lost.
-   [ ] There's no rate limiting of any kind. It would probably be advisable to implement it to some extent.
-   [ ] In tandem with the previous point I thought about maybe implementing a programmer-friendly API to manipulate the canvas with code. This would open up a lot more possiblities and could be quite fun.
-   [ ] The current setup is such that a single redis instance handles all traffic. Thanks to the (logical) independence of the individual sections it should be (relatively) straightforward to disperse them onto multiple instances, each handling only some of them. Of course, coordinating this will require some thinking.
-   [x] ~~Currently Go doesn't wait for redis to finish loading and also doesn't retry to connect, leading to the service having to be restarted. Should be a quick fix (As an "interesting" alternative one could also intentionally crash the Go server when it can't connect to redis; Since the service will automatically restart, this would potentially be the "hottest" of all possible fixes).~~ The go server now waits for redis to start up and finish loading the data (on failure it simply tries again after a short timeout). 
