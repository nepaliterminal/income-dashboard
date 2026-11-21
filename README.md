# Bankroll

abhinav's income tracker. It shows every money stream and progress toward the current goal (Xbox + GTA 6, $650).

- Goal card: total so far, amount to go, last-30-day pace, projected date, and the weekly amount needed to hit the target date.
- Log money per stream, then mark each entry once it reaches Cash App.
- Add a stream for every new income source (the Apify stream is built in).
- Live Apify Actor stats for `acute_view`: Store status, price, and users in the last 30 days, refreshed every 15 min. Apify's API doesn't report earnings, so payouts are logged by hand.

## Run

```sh
APIFY_TOKEN=... PORT=3010 npm start   # data in ~/.income-dashboard/db.json (override with DATA_FILE)
npm test
```

No dependencies; Node 20+.
