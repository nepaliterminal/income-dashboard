# Bankroll

abhinav's income tracker. It shows every money stream and progress toward the current goal (Xbox + GTA 6, $650).

- Goal card: total so far, amount to go, last-30-day pace, projected date, and the weekly amount needed to hit the target date.
- Log money per stream, then mark each entry once it reaches Cash App.
- Add a stream for every new income source (the Apify stream is built in).
- Live stats for the public `acute_view` Apify Actors (Store status, price, users in the last 30 days), read from Apify's public API with no token and refreshed every 15 min. Apify's API doesn't report earnings, so payouts are logged by hand. New Actors: add their names to `APIFY_ACTORS` in `docs/lib.js`.

## Hosting ($0)

Bankroll is a static site in `docs/`, served by GitHub Pages at https://nepaliterminal.github.io/income-dashboard/. There is no server: data is saved in the browser's `localStorage` on each device. Add it to the iPhone Home Screen so Safari keeps the data, and use **Backup → Export** now and then (**Import** restores a backup on any device).

Pages setup (repo owner, once): make the repo public (Settings → General → Danger Zone → Change visibility), then Settings → Pages → Build and deployment → Source: Deploy from a branch, Branch: `main`, folder `/docs` → Save.

## Develop

```sh
npm start   # http://localhost:3010
npm test
```

No dependencies; Node 20+.
