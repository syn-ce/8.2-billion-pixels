# 8.2 Billion Pixels

![Screenshot of the website. "8.2 Billion Pixels" has been written as pixel art on the canvas in various pastel colors](/imgs/example_screenshot.png)

Reddit's 2023 r/place consisted of 6 Million individual pixels. As of writing this there are ~8.2 Billion humans on earth - way too many for everyone to get a spot on the canvas! So let's build a place for everyone.

Try it yourself: [click me](https://bipix.m-amthor.com)

Note that this project is still **in development**. In particular, here's a list of known issues that have yet to be adressed:

## Known Issues / TODO

-   [ ] When using Firefox on a mobile device, the position of the reticle will not properly match the canvas, leading to a very unsatisfying user experience. In other browsers and on desktop this problem does not occur. If you have an idea what could cause this, here's a [related stackoverflow post](https://stackoverflow.com/questions/79057124/canvas-content-escapes-canvas-on-mobile-in-firefox). Similarly, the reticle's outline isn't properly clipped.
-   [ ] The worker of the flask server instances is prone to timing out. In general, the backend is quite wonky at the moment. In general, its appearance also needs some polishing.
-   [ ] The UI has a couple of bugs, e.g., sometimes the reticle escapes the logical canvas (that is, it hovers over a pixel "out of bounds" that cannot be set).
-   [ ] While the fetching of and subscribing to sections basically works, no buffering (be it in space or time) is implemented, meaning as soon as a section goes out of view the client unsubscribes, forgets about it and has to request it again once it reenters the view.
-   [ ] The zoom levels are restricted to whole integers. Especially on mobile this can feel awkward. Fixing this should be straightforward (it was initially introduced to avoid fractional offsets; working with exact values in the background and rounding them to, say, 2 decimals when applying should have potential to work)
-   [ ] Currently there's no manual synchronization happening. Instead, both the server and the client rely on events arriving in the order in which they were dispatched. Since this is not guaranteed (especially considering the variety in latencies from clients to the server), adding timestamps to the events will be necessary.
-   [ ] Because browsers don't necessarily like to agree on how to calculate heights of windows and viewports, the reticle is currently not centered on Firefox.

## Architecture

This is the general setup. Since Traefik already proxies my server, I've decided to integrate with that and spin the services up in a Docker Swarm.

![Traefik in front of a Docker Swarm, with nginx serving static content and flask processing updates and storing data in redis, publishing events via pubsub.](/imgs/architecture_overview_dark.png)

## How to synchronize 8.2 Billion pixels

The key insight is that of all these pixels, only a fraction of them is visible at any given time for any one client. Even with a 4k monitor, only a little more than 0.1% (~8 Million pixels) of all pixels will be visible.
It is therefore natural to split the actual canvas up into logical _sections_ of size, let's say, 1000x1000 pixels. (Varying this size and maybe even adjusting it dynamically based on, e.g., server load, could potentially be a very interesting undertaking!) With 1 Million pixels each, we get a little more than 8000 of these logical square sections. A client will then simply only fetch the data of the sections which are currently visible to it (potentially with a bit of buffering as to avoid frequent reloads at edges of sections), and similarly subscribe to only these as well.
A client will then fetch the whole array of data for any section which comes into view and then subscribe to it to get notified about pixels being placed in it.
