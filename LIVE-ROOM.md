# Live Room

One screen hosts, everyone else joins by code. The host screen and the phones meet in a Firebase Realtime Database on the free plan. The site talks to it over plain HTTPS (REST plus streaming), with no Firebase SDK.

## Connect it (once)

1. Go to https://console.firebase.google.com, sign in with a Google account and create a project. Analytics can stay off.
2. In the left sidebar open **Databases & Storage → Realtime Database** and click **Create database**. Pick a location and start in **locked mode**. (Choose Realtime Database, not Firestore.)
3. Open the **Rules** tab, replace what is there with the rules below, and publish.
4. Copy the database address from the top of the **Data** tab. It ends in `firebaseio.com` (United States) or `firebasedatabase.app` (other locations).
5. Put it in `LIVE_DB` near the top of `build.mjs`, run `node build.mjs`, commit and push.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Anyone who knows a room's four-letter code can read and write that room. Nobody can list rooms or touch anything else. A room holds the game settings, nicknames, answer taps and scores, and the host deletes it with **Close the room**.

To check the address, open `<address>/rooms/TEST.json` in a browser. `null` means it is connected and the rules are live. `Permission denied` means the rules are not published. A message about a different region includes the address to use instead.

## Run one

1. Open `live.html#host` on the screen everyone can see. Pick the question mix, how many and how long, then **Open the room**.
2. Players scan the QR code, or open the site, tap **Live Room** and type the code.
3. **Start** when the names are in. Tap a name to remove it. Each question ends when everyone has answered or the clock runs out. **Next question** moves on.
4. After the podium: **Play again, same room** or **Close the room**.

Right answers score 600 points plus up to 400 for speed.

## Before you present

- Run a full game with two phones on the same Wi-Fi the room will use. Some campus networks block streaming connections; phones then fall back to checking for updates every second and a half, which still works.
- The free plan allows 100 devices connected at once.
- If the database is unreachable on the day, send everyone the same challenge link from the Play page instead. It needs no server.

## Try it without a database

`live.html#host&local` runs a room inside one browser: host in one tab, players in others. It is how the tests run, and a quick way to see the flow.
