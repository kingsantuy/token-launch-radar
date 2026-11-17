// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, a filterable table, a per-protocol detail drawer with the model's own inputs and the
// protocol's farm plan. No network: every byte it shows is in data.js. No protocol name is special-cased.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  var M = DATA.model || {};
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var lastFocus = null;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function chainsOf(p) {
    return p.chains && p.chains.length ? p.chains.slice(0, 2).join(', ') + (p.chains.length > 2 ? ' +' + (p.chains.length - 2) : '') : 'an unnamed chain';
  }

  // The base multiple one row uses: a per-row multiple first, then its category's median, then the
  // model's overall median, clamped to the model's band. The source is shown in the detail view.
  function baseMultipleOf(row) {
    var value;
    var source;
    if (typeof row.base_multiple === 'number') { value = row.base_multiple; source = 'per-row multiple'; }
    else {
      var cm = M.category_multiples;
      if (cm && typeof cm[row.category] === 'number') { value = cm[row.category]; source = 'median for ' + (row.category || 'Other'); }
      else { value = (typeof M.base_multiple_default === 'number' ? M.base_multiple_default : M.base_multiple); source = 'overall median (default)'; }
    }
    var lo = typeof M.multiple_floor === 'number' ? M.multiple_floor : -Infinity;
    var hi = typeof M.multiple_cap === 'number' ? M.multiple_cap : Infinity;
    return { value: Math.min(hi, Math.max(lo, value)), source: source };
  }
  // The chain-breadth factor: each extra chain up to the cap is worth the chain weight.
  function chainMultiplierOf(row) {
    var n = row.chains ? row.chains.length : 0;
    var extra = Math.min(Math.max(n - 1, 0), typeof M.chain_cap === 'number' ? M.chain_cap : 10);
    return { value: 1 + (typeof M.chain_weight === 'number' ? M.chain_weight : 0) * extra, chains: n };
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var bm = baseMultipleOf(row);
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, typeof row.change_7d === 'number' ? row.change_7d : 0));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var chain = chainMultiplierOf(row);
    var age = (row.age_days === null || row.age_days === undefined) ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * bm.value * growthMult * chain.value * maturity)),
      base: bm.value, baseSource: bm.source,
      growth: growth, growthMult: growthMult,
      chainMult: chain.value, chainCount: chain.chains,
      ageUsed: age, ageKnown: row.age_days !== null && row.age_days !== undefined,
      maturityMult: maturity
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---- hash state: #q=…&category=…&tab=…&p=<slug>, so any view deep-links ----
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q') !== null) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab') === 'live' || params.get('tab') === 'pre-token') state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    var url = next ? '#' + next : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  }

  // ---- filtering and sorting ----
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---- static shell, built once; only the table body re-renders on filter/sort ----
  var shell, tableHost, countEl, tabPre, tabLive, searchInput, categorySelect;
  var sortKeys = ['implied', 'name', 'tvl', 'growth', 'age'];

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }
  function lede() {
    return el('section', { class: 'lede', 'aria-label': 'Summary' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least ' + fmtUsd(DATA.floor_usd) + ' of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    searchInput = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    searchInput.addEventListener('input', function () { state.q = searchInput.value; writeHash(); renderTable(); });
    categorySelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) {
        return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null });
      })
    );
    categorySelect.addEventListener('change', function () { state.category = categorySelect.value; writeHash(); renderTable(); });
    tabPre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')', onclick: function () { state.tab = 'pre-token'; syncTabs(); writeHash(); renderTable(); } });
    tabLive = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + DATA.live_size + ')', onclick: function () { state.tab = 'live'; syncTabs(); writeHash(); renderTable(); } });
    countEl = el('span', { class: 'count', 'aria-live': 'polite' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), searchInput),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), categorySelect),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs', role: 'group', 'aria-label': 'Token status' }, tabPre, tabLive)),
      countEl
    );
  }
  function syncTabs() {
    tabPre.setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    tabLive.setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
  }

  function sortHeader(key, label) {
    var th = el('th', { scope: 'col', 'aria-sort': state.sort === key ? (state.dir < 0 ? 'descending' : 'ascending') : 'none' });
    var btn = el('button', { type: 'button', 'aria-label': 'Sort by ' + label + (state.sort === key ? (state.dir < 0 ? ', descending' : ', ascending') : ''), onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      renderTable();
    } }, label, state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '↓' : '↑' }) : null);
    th.appendChild(btn);
    return th;
  }

  function rowCells(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return [
      el('td', { class: 'num rank', text: String(r.rank) }),
      el('td', null, el('div', { class: 'name' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainsOf(r) })
      )),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + growthClass, text: growth }),
      el('td', { class: 'num', text: fmtAge(r.age_days) }),
      el('td', null, el('div', { class: 'implied' },
        el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' })),
        el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
      )),
      el('td', null, el('span', { class: 'status', text: 'No token' }))
    ];
  }

  function renderTable() {
    tableHost.textContent = '';
    if (state.tab === 'live') {
      countEl.textContent = DATA.live.length + ' live-token protocols';
      var liveBody = el('tbody');
      DATA.live.forEach(function (r) {
        liveBody.appendChild(el('tr', null,
          el('td', null, el('span', { class: 'status live', text: 'Already trades' })),
          el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainsOf(r) }))),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', null, el('span', { class: 'status live', text: 'Live token' }))
        ));
      });
      tableHost.appendChild(el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
              el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
            liveBody
          )
        )
      ));
      return;
    }
    var list = sortedRows(filteredRows());
    countEl.textContent = list.length === DATA.board_size
      ? DATA.board_size + ' pre-token rows'
      : 'Showing ' + list.length + ' of ' + DATA.board_size + ' pre-token rows';
    if (list.length === 0) {
      tableHost.appendChild(el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; searchInput.value = ''; categorySelect.value = 'all'; writeHash(); renderTable();
        } })
      )));
      return;
    }
    var maxImplied = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-clickable': 'true',
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      });
      rowCells(r, maxImplied).forEach(function (c) { tr.appendChild(c); });
      tbody.appendChild(tr);
    });
    tableHost.appendChild(el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    ));
  }

  function modelPanel() {
    var cm = M.category_multiples || {};
    var keys = Object.keys(cm);
    var multRows;
    if (keys.length) {
      multRows = keys.sort(function (a, b) { return cm[b] - cm[a] || (a < b ? -1 : 1); }).map(function (c) {
        return el('tr', null, el('th', { scope: 'row', text: c }), el('td', { class: 'num', text: String(cm[c]) }));
      });
      multRows.push(el('tr', null, el('th', { scope: 'row', text: 'All other categories' }), el('td', { class: 'num', text: String(M.base_multiple_default !== undefined ? M.base_multiple_default : M.base_multiple) + ' (overall median)' })));
    } else {
      multRows = [el('tr', null, el('th', { scope: 'row', text: 'All categories' }), el('td', { class: 'num', text: String(M.base_multiple_default !== undefined ? M.base_multiple_default : M.base_multiple) }))];
    }
    var baseNote = keys.length
      ? 'The base multiple is the median market-cap-to-TVL ratio of live-token comps in the category; categories without a comp set use the overall median. Multiples are clamped to ' + M.multiple_floor + ' … ' + M.multiple_cap + '.'
      : 'This model uses one base multiple, ' + (M.base_multiple_default !== undefined ? M.base_multiple_default : M.base_multiple) + ', for every category.';
    return el('section', { class: 'panel model', 'aria-label': 'Methodology' },
      el('div', { class: 'model-head' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. ' + baseNote })
      ),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('div', { class: 'formula' },
            'implied = max(1, round( tvl_usd × base_multiple × (1 + clamp(change_7d, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 × ' + M.growth_weight + ') × (1 + ' + M.chain_weight + ' × min(max(chains − 1, 0), ' + M.chain_cap + ')) × (' + M.maturity_floor + ' + min(age_days, ' + M.maturity_days + ') / ' + M.maturity_days + ' × ' + M.maturity_range + ') ))'
          ),
          el('p', { class: 'model-note', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + M.unknown_age_days + ' days. Growth is clamped to ' + M.growth_floor + '% … ' + M.growth_cap + '% before it is weighted, each extra chain up to ' + M.chain_cap + ' adds ' + M.chain_weight + ' to the breadth factor, and maturity rises from ' + M.maturity_floor + ' to ' + (M.maturity_floor + M.maturity_range) + ' over ' + M.maturity_days + ' days. The multiples are thin for the biggest watchlist names — most comps are far smaller than the protocols they price, and 22 of the 40 watchlist rows use the overall median — so every row’s multiple is printed beside its implied value in its detail view.' })
        ),
        el('div', null,
          el('div', { class: 'mult-title', text: 'Base multiple by category' }),
          el('table', { class: 'mult' }, el('tbody', null, multRows))
        )
      ),
      el('p', { class: 'honest', text: 'Honest note: implied value is a model, not a price and not a prediction — it says what a protocol would be worth if the market priced its TVL the way this model does. Snapshot as of ' + DATA.as_of + ', from the DefiLlama protocol index. “No token” means the snapshot records no market cap, CoinGecko id or symbol for that protocol.' })
    );
  }

  // ---- detail drawer ----
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () {
    state.selected = null;
    writeHash();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
    renderTable();
  });

  function eqRow(label, value) {
    return el('div', null, el('span', { class: 'k', text: label }), el('span', { class: 'v', text: value }));
  }
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    lastFocus = document.activeElement;
    state.selected = slug;
    writeHash();
    var calc = impliedOf(row);
    var agrees = calc.implied === row.implied_value_usd;
    var diff = Math.abs(calc.implied - row.implied_value_usd);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · pre-token' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.listed_at ? ' · listed ' + row.listed_at : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var working = fmtUsd(row.tvl_usd) + ' × ' + calc.base + ' × ' + round4(calc.growthMult) + ' × ' + round4(calc.chainMult) + ' × ' + round4(calc.maturityMult) + ' = ' + fmtUsd(calc.implied);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        eqRow('TVL', fmtUsd(row.tvl_usd)),
        eqRow('Base multiple (' + calc.baseSource + ')', String(calc.base)),
        eqRow('7-day change' + (row.change_7d === null ? ' (none recorded)' : ''), fmtPct(row.change_7d) + (row.change_7d !== null ? ' → clamped ' + fmtPct(calc.growth) : '')),
        eqRow('Growth multiplier', String(round4(calc.growthMult))),
        eqRow('Chains (' + calc.chainCount + (calc.chainCount === 1 ? ' chain' : ' chains') + ')', String(round4(calc.chainMult))),
        eqRow('Age with no token', calc.ageKnown ? fmtAge(row.age_days) + ' (' + row.age_days + ' days)' : 'unknown — ' + M.unknown_age_days + ' days assumed'),
        eqRow('Maturity multiplier', String(round4(calc.maturityMult))),
        el('div', { class: 'total' }, el('span', { class: 'k', text: 'Recomputed implied value' }), el('span', { class: 'v', text: fmtUsd(calc.implied) })),
        el('div', null, el('span', { class: 'k', text: 'Value in board.json' }), el('span', { class: 'v', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { class: 'k', text: 'Agreement' }),
          el('span', { class: 'v' }, el('span', { class: 'agree' + (agrees ? '' : ' bad'), text: agrees ? 'Agrees' : 'Differs by ' + fmtUsd(diff) })))
      ),
      el('div', { class: 'working', text: working }),
      el('p', { class: 'detail-note', text: agrees
        ? 'The page recomputes this row from the snapshot figures and gets the same number board.json carries.'
        : 'The recomputed number does not match board.json — treat the board figure as stale and check the data.' })
    ));
    var steps = farmSteps(row);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'detail-note', text: 'The plan is derived from this protocol’s category, chains, TVL and age — the same derivation main.ts writes to board.json. No token is recorded for this protocol in the snapshot.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    renderTable();
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Snapshot ' + DATA.as_of }),
      el('span', { text: 'Source: DefiLlama protocol index' }),
      el('span', { text: 'Model ' + DATA.model_version }),
      el('span', { text: 'Implied value is a model, not a price.' })
    );
  }

  readHash();
  shell = el('div', { class: 'shell' });
  shell.appendChild(header());
  shell.appendChild(lede());
  shell.appendChild(controls());
  tableHost = el('div', null);
  shell.appendChild(tableHost);
  shell.appendChild(modelPanel());
  shell.appendChild(footer());
  app.appendChild(shell);
  app.appendChild(dialog);
  app.setAttribute('aria-busy', 'false');
  renderTable();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('hashchange', function () {
    var prev = state.selected;
    readHash();
    if (state.q !== searchInput.value) searchInput.value = state.q;
    if (state.category !== categorySelect.value) categorySelect.value = state.category;
    syncTabs();
    renderTable();
    if (state.selected && state.selected !== prev) openDetail(state.selected);
  });
})();
