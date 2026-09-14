# Shared crown integration

The crown counts completed head-to-head matches between Mahmoud and Safy, one win per match. Solo, cooperative, drawn and abandoned matches do not award a win. Existing shared Ocho and Dominoes totals are imported once; solo trial results are never imported. A tied score retains the current champion; 0–0 starts without a champion.

New server-side game engines call `recordCompetitiveResult` from `crown.mjs` in the same transaction that finishes the match, before updating any legacy game ledger:

```js
recordCompetitiveResult(state, {
  game: 'chess', title: 'Chess', matchId: match.id,
  participants: match.players, mode: 'shared',
  status: 'complete', winner: match.winner
}, now);
```

Only call after the server verifies completion and winner. Do not expose this function as a client-supplied score endpoint. The stable `(game, matchId)` key prevents duplicate wins, including retries after restarts. Changing a winner for an already recorded match is not accepted. The game is automatically added to both players' crown breakdown; no crown scoring or title changes are required. New game screens can display the shared snapshot's holder and title in a single champion line.

`state.competition` retains totals, per-game wins and deduplication IDs independently of the capped game histories. Persist it in the existing Store transaction. Both authenticated players receive the same shared crown projection. Crown announcements use the revision to avoid replaying on repeated snapshots and do not trigger AI requests.
