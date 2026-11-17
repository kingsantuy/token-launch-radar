# Method note — model `radar-2`

## The question

From a sealed snapshot of every protocol DefiLlama tracks (758 protocols,
snapshot 2026-11-14, floor $50,000,000), which protocols still record no token
and are not a wrapped or staked product of one that trades — and what would
their launch be worth? The snapshot carries no ranking, no implied value, no
farm plan and no airdrop flag. Deriving them is this entry's work.

## The board

- **178 rows.** 40 watchlist rows (every slug in the snapshot's watchlist)
  plus 138 early rows: pre-token protocols below the $50M floor, taken by TVL,
  under the same exclusion the watchlist rule applies — not an exchange, not a
  bridge-family, liquid-staking or restaked product, not a versioned pool, and
  the name carries no whole word "wrapped", "staked" or "staking" and does not
  begin with an exchange's name. A protocol is pre-token when its record shows
  no market cap, no CoinGecko id and no symbol.
- **24 live-token protocols set aside**, by market cap. They already trade, so
  the board shows their market caps as facts, never mixed into the ranking.

## The model

One function scores every row. No protocol name is special-cased.

```
implied = round(TVL x multiple
                x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                x (1 + 0.02 x min(max(chains - 1, 0), 10))
                x (0.6 + min(age_days, 1095) / 1095 x 0.4))
```

- **multiple** — the category's median market-cap/TVL over token-bearing
  comps in the same category. A comp counts only with a market cap above zero
  and only where the category has at least 3 comps. The multiple is clamped
  to [0.05, 1.00]. Any other category uses the whole-comp median, 0.2138
  (n=128). Medians, not means: one outlier cannot set a multiple.
- **growth** — the 7-day TVL change, clamped to [-60, +120]%, at half weight.
  A null change scores as 0.
- **breadth** — each chain beyond the first adds 2%, capped at +20%. A
  single-chain protocol gets 1.00.
- **maturity** — 0.6 plus up to 0.4 for age, capped at 3 years. Age is the days
  from `listed_at` to the snapshot date; an unknown age uses 365 days.

## The comparable multiples

Computed from the snapshot itself (token-bearing protocols only, market cap
above zero). Categories with fewer than 3 comps use the overall median 0.2138.

| Category | n | Median mcap/TVL |
| --- | --- | --- |
| Basis Trading | 7 | 0.6544 |
| CDP | 3 | 0.1687 |
| Dexs | 11 | 0.3424 |
| Indexes | 3 | 0.1477 |
| Lending | 15 | 0.1324 |
| RWA | 9 | 0.2748 |
| Yield | 9 | 0.1914 |
| Yield Aggregator | 4 | 0.1510 |
| Any other category | 128 (all comps) | 0.2138 |

Worked example — Steakhouse Financial (rank 1): TVL $2,753,981,495 x 0.2138
(Risk Curators has 1 comp, so the overall median) x (1 - 0.021935 x 0.5)
x 1.20 (11 chains) x 0.7986 (543 days) = $557,901,091.

## Farm plans

Each row carries six steps, derived from the protocol's own record — category,
chains, TVL and age — never from a hand-written list of names. The action
follows the category (supply for lending, liquidity for DEXes, vault deposit
for curators/allocators, margin for perps and basis trading, stake, bridge,
mint or cover as the category says). Capital is $50–$250 by TVL; the hold is
30–60 days by age, longer for younger protocols. Every plan starts with a
fresh wallet and ends with a farm log, and claims only from the link the
protocol itself publishes. No step names a URL, a points program or an
airdrop: the snapshot confirms none of those.

## Limitations, stated plainly

1. **Thin comps.** Most comparables are far smaller than the protocols they
   price (e.g. the RWA comps' median TVL is $47M against watchlist RWA names
   up to $309M; Risk Curators has exactly 1 comp at $12M TVL). 22 of the 40
   watchlist rows use the overall median, not a category multiple. The board
   prints every row's multiple beside its implied value so the compression is
   visible.
2. **The multiple is a market-cap/TVL ratio, not a valuation.** It says what
   the market currently pays per dollar of TVL for live tokens in the
   category — a starting point for a launch, not a forecast of a listing
   price. A token could list far above or below it, or never list.
3. **One week of growth is noisy.** The snapshot week's universe median
   change was -8.23%; the watchlist median was -3.29%. Growth is clamped and
   half-weighted for exactly that reason.
4. **The snapshot is frozen at 2026-11-14.** Protocols may have launched a
   token, changed TVL or shut down since. Nothing here updates it.
5. **Age is a listing date, not a launch date.** Six watchlist protocols
   share `listed_at` 2025-05-20 — a DefiLlama batch date, not six launches.
   Two watchlist protocols have no `listed_at` at all and use the 365-day
   fallback. Age moves the value by at most 0.6–1.0x, so the artefact cannot
   dominate a ranking.
6. **"No token" means "no token recorded".** DefiLlama's record is not proof
   a protocol has no token; it is the record the competition defines.

## Reproducibility

Node 22, standard library only, no network, no wall-clock time, no
randomness. `node main.ts` reads `/input/snapshot.json` (or `--input
<snapshot.json|directory>`) and writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to `/output` (or `MAKEFUN_OUTPUT_DIR`). Two
runs on the same snapshot write byte-identical output.
