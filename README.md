# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kingsantuy/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kingsantuy/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: 178 pre-token protocols from the DefiLlama snapshot of 2026-11-14, ranked by implied value from category comparable multiples. All 40 watchlist protocols are covered, plus 138 early rows below the $50M TVL floor, each with a farm plan. Node 22, standard library only; the dashboard is a static page with no network.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/kit/input/snapshot.json
# then open out/dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=s0wyc55q&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What this is

The competition hands in a sealed snapshot of every protocol DefiLlama tracks
(758 protocols, snapshot 2026-11-14) and asks which ones still record no token
and are not a wrapped or staked product of one that trades — and what their
launch would be worth. This entry answers with a ranked board of 178 rows:

- **40 watchlist rows** — every protocol at or above the $50M TVL floor with
  no token on record, exactly as the snapshot's watchlist defines them.
- **138 early rows** — pre-token protocols below the floor, under the same
  exclusion the watchlist rule applies (no exchange, no bridge-family,
  liquid-staking or restaked product, no versioned pool, no
  wrapped/staked/staking name, no exchange-prefixed name), taken by TVL.
- **24 live-token protocols set aside** — they already trade, so the board
  shows their market caps as facts, never mixed into the ranking.

## Method

Implied value is one function of the snapshot's own figures, the same for
every row (model `radar-2`, see `METHOD.md` for the full note):

```
implied = round(TVL x category multiple
                x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                x (1 + 0.02 x min(chains - 1, 10))
                x (0.6 + min(age_days, 1095) / 1095 x 0.4))
```

The category multiple is the median market-cap/TVL of token-bearing comps in
the same category (market cap above zero, at least 3 comps), clamped to
[0.05, 1.00]; any other category uses the whole-comp median 0.2138. No live
prices, no external APIs, no airdrop confirmations are used or claimed: the
snapshot carries no ranking, no implied value and no farm plan, and deriving
them is this entry's work. Implied value is a model, not a price.

## Layout

- `main.ts` — entrypoint: reads the snapshot, scores the board, writes
  `board.json`, the dashboard data and `dossier.json` to the output directory.
- `lib/model.ts` — the model, the board builder and the farm-plan derivation.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `dashboard/` — the static page (board, per-protocol detail, filter, live view).
- `screenshots/` — the board, a protocol detail view and a filtered view.
- `METHOD.md` — the model, the comparable multiples and the limitations.
