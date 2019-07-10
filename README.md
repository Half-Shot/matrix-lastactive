# matrix-lastactive

A small utility to determine when a user was last active.

# How to use


Install with

```
npm i matrix-lastactive
```

To use

```Typescript
import { MatrixActivityTracker } from "matrix-lastactive";

// Create the tracker object.
const tracker = new MatrixActivityTracker({
    homeserverUrl: "https://localhost",
    accessToken: "ABCDE",
    serverName: "localhost",
    defaultOnline: false,
});

tracker.isUserOnline(
    "@Half-Shot:half-shot.uk"
    1000 * 60 * 60 * 24 // 24 hours
).then((isOnline) => {
    if (isOnline) {
        console.log("Half-Shot is online");
    } else {
        console.log("Half-Shot is offline");
    }
});


// You could also plug the library into an event handler..
myfakeemitter.on("event", (event) => {
    // ..and keep track of how long ago you saw a message from a user.
    tracker.bumpLastActiveTime(event.sender);
});
```

# Contact

If you need help with this library, please contact [@Half-Shot:half-shot.uk](https://matrix.to/#/@Half-Shot:half-shot.uk)