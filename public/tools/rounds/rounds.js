(function () {
    'use strict';

    // ── Event metadata ──────────────────────────────────────
    const EVT_NAME = {
        '333': '3×3×3',
        '222': '2×2×2',
        '444': '4×4×4',
        '555': '5×5×5',
        '666': '6×6×6',
        '777': '7×7×7',
        '333bf': '3×3 Blind',
        '333oh': '3×3 OH',
        'clock': 'Clock',
        'minx': 'Megaminx',
        'pyram': 'Pyraminx',
        'skewb': 'Skewb',
        'sq1': 'Square-1',
        '444bf': '4×4 Blind',
        '555bf': '5×5 Blind',
        '333mbf': 'Multi-Blind',
        '333fm': 'FMC',
    };
    const EVT_ICON = {
        '333': '<span class="cubing-icon event-333 unofficial-333"></span>',
        '222': '<span class="cubing-icon event-222 unofficial-222"></span>',
        '444': '<span class="cubing-icon event-444 unofficial-444"></span>',
        '555': '<span class="cubing-icon event-555 unofficial-555"></span>',
        '666': '<span class="cubing-icon event-666 unofficial-666"></span>',
        '777': '<span class="cubing-icon event-777 unofficial-777"></span>',
        '333bf': '<span class="cubing-icon event-333bf unofficial-333bf"></span>',
        '333oh': '<span class="cubing-icon event-333oh unofficial-333oh"></span>',
        'clock': '<span class="cubing-icon event-clock unofficial-clock"></span>',
        'minx': '<span class="cubing-icon event-minx unofficial-minx"></span>',
        'pyram': '<span class="cubing-icon event-pyram unofficial-pyram"></span>',
        'skewb': '<span class="cubing-icon event-skewb unofficial-skewb"></span>',
        'sq1': '<span class="cubing-icon event-sq1 unofficial-sq1"></span>',
        '444bf': '<span class="cubing-icon event-444bf unofficial-444bf"></span>',
        '555bf': '<span class="cubing-icon event-555bf unofficial-555bf"></span>',
        '333mbf': '<span class="cubing-icon event-333mbf unofficial-333mbf"></span>',
        '333fm': '<span class="cubing-icon event-333fm unofficial-333fm"></span>',
    };

    // ── State ───────────────────────────────────────────────
    let allComps = [];
    let activeFilter = 'all';
    let searchQuery = '';
    let currentComp = null;
    let currentAnalysis = null; // { competitionId, eventId, roundId, data }
    let liveTimer = null;
    let lastRefresh = null;
    let inspectorChart = null;
    let streamAbortCtrl = null;
    let pendingProfiles = null;

    // ── DOM refs ────────────────────────────────────────────
    const $results = document.getElementById('scoutResults');
    const $search = document.getElementById('scoutSearch');
    const $searchClear = document.getElementById('scoutSearchClear');
    const $country = document.getElementById('scoutCountry');
    const $backdrop = document.getElementById('scoutBackdrop');
    const $drawer = document.getElementById('scoutDrawer');
    const $drawerTitle = document.getElementById('scoutDrawerTitle');
    const $drawerMeta = document.getElementById('scoutDrawerMeta');
    const $drawerBody = document.getElementById('scoutDrawerBody');
    const $drawerClose = document.getElementById('scoutDrawerClose');
    const $overlay = document.getElementById('scoutOverlay');
    const $overlayBack = document.getElementById('scoutOverlayBack');
    const $overlayTitle = document.getElementById('scoutOverlayTitle');
    const $overlayBody = document.getElementById('scoutOverlayBody');
    const $refreshBtn = document.getElementById('scoutRefreshBtn');
    const $inspector = document.getElementById('scoutInspector');
    const $inspBg = document.getElementById('scoutInspectorBg');
    const $inspAvatar = document.getElementById('scoutInspAvatar');
    const $inspName = document.getElementById('scoutInspectorName');
    const $inspSub = document.getElementById('scoutInspectorSub');
    const $inspBody = document.getElementById('scoutInspectorBody');
    const $inspClose = document.getElementById('scoutInspClose');

    // ── Utilities ───────────────────────────────────────────
    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtTime(cs) {
        if (!cs || cs <= 0) return '—';
        const s = cs / 100;
        if (s < 60) return s.toFixed(2);
        const m = Math.floor(s / 60);
        return `${m}:${(s % 60).toFixed(2).padStart(5, '0')}`;
    }

    function fmtPct(p) {
        if (p == null || isNaN(p)) return '—';
        const v = p * 100;
        if (v < 0.5 && v > 0) return '<1%';
        return `${Math.round(v)}%`;
    }

    function flag(iso2) {
        if (!iso2 || iso2.length !== 2) return '';
        return [...iso2.toUpperCase()]
            .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
            .join('');
    }

    function fmtDate(d) {
        if (!d) return '';
        return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }

    function debounce(fn, ms) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    }

    async function apiFetch(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    // ── Load competitions ───────────────────────────────────
    async function loadCompetitions() {
        $results.innerHTML =
            '<div class="scout-loading"><div class="scout-spinner"></div>Loading competitions…</div>';
        try {
            const params = new URLSearchParams();
            if ($country.value) params.set('country', $country.value);
            allComps = await apiFetch(`/api/competitions?${params}`);
            renderList();
        } catch (e) {
            $results.innerHTML = `<div class="scout-empty">Could not load competitions.<br><small style="color:var(--secondary-text)">${esc(e.message)}</small></div>`;
        }
    }

    function renderList() {
        let comps = allComps;
        if (activeFilter === 'ongoing') comps = comps.filter((c) => c.status === 'ongoing');
        if (activeFilter === 'upcoming') comps = comps.filter((c) => c.status !== 'ongoing');
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            comps = comps.filter(
                (c) =>
                    (c.name || '').toLowerCase().includes(q) ||
                    (c.city || '').toLowerCase().includes(q) ||
                    (c.country_iso2 || '').toLowerCase().includes(q),
            );
        }

        if (!comps.length) {
            $results.innerHTML = '<div class="scout-empty">No competitions found.</div>';
            return;
        }

        $results.innerHTML = comps
            .map((c) => {
                const isLive = c.status === 'ongoing';
                const dateStr =
                    c.end_date && c.end_date !== c.start_date
                        ? `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`
                        : fmtDate(c.start_date);
                return `
                    <button class="scout-comp-card" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
                    <span class="scout-status-dot${isLive ? ' live' : ''}"></span>
                    <span class="scout-comp-info">
                        <span class="scout-comp-name">${esc(c.name)}</span>
                        <span class="scout-comp-meta">
                        <span>${flag(c.country_iso2)} ${esc(c.city || c.country_iso2 || '')}</span>
                        <span>${dateStr}</span>
                        ${isLive ? '<span class="scout-live-label">● Live</span>' : ''}
                        </span>
                    </span>
                    <span class="scout-comp-arrow">›</span>
                    </button>`;
            })
            .join('');

        $results.querySelectorAll('.scout-comp-card').forEach((el) => {
            el.addEventListener('click', () => openDrawer(el.dataset.id));
        });
    }

    // ── Drawer ──────────────────────────────────────────────
    async function openDrawer(id) {
        currentComp = allComps.find((c) => c.id === id) || { id, name: id };
        $drawerTitle.textContent = currentComp.name || id;

        const dateStr =
            currentComp.end_date && currentComp.end_date !== currentComp.start_date
                ? `${fmtDate(currentComp.start_date)} – ${fmtDate(currentComp.end_date)}`
                : fmtDate(currentComp.start_date);
        $drawerMeta.innerHTML = `
      <span>${flag(currentComp.country_iso2)} ${esc(currentComp.city || '')} ${esc(currentComp.country_iso2 || '')}</span>
      <span>${dateStr}</span>`;

        $drawerBody.innerHTML =
            '<div class="scout-loading"><div class="scout-spinner"></div>Loading events…</div>';
        $backdrop.classList.add('open');
        $drawer.classList.add('open');
        document.body.style.overflow = 'hidden';

        try {
            const ov = await apiFetch(`/api/competitions/${id}/overview`);
            if (ov.isLive) {
                $drawerMeta.insertAdjacentHTML(
                    'beforeend',
                    ' <span class="scout-live-badge">LIVE</span>',
                );
            }
            renderDrawerEvents(ov);
        } catch (e) {
            $drawerBody.innerHTML = `<div class="scout-empty">⚠️ Could not load competition details.<br><small>${esc(e.message)}</small></div>`;
        }
    }

    function closeDrawer() {
        $backdrop.classList.remove('open');
        $drawer.classList.remove('open');
        document.body.style.overflow = '';
        closeOverlay();
    }

    function renderDrawerEvents(ov) {
        if (!ov.events?.length) {
            $drawerBody.innerHTML = '<div class="scout-empty">No events found.</div>';
            return;
        }

        const html = `<div class="scout-events-list">${ov.events
            .map((ev) => {
                const name = EVT_NAME[ev.id] || ev.id;
                const icon = EVT_ICON[ev.id] || '🎲';
                const rounds = (ev.rounds || [])
                    .map((r, i, arr) => {
                        const n = i + 1;
                        const lbl =
                            arr.length === 1
                                ? 'Final'
                                : n === arr.length
                                  ? 'Final'
                                  : n === arr.length - 1
                                    ? 'Semi-final'
                                    : `Round ${n}`;
                        const fmt =
                            {
                                a: 'Avg of 5',
                                m: 'Mean of 3',
                                1: 'Best of 1',
                                2: 'Best of 2',
                                3: 'Best of 3',
                            }[r.format] || r.format;
                        const resultCount = r.results?.length;
                        return `
          <button class="scout-round-btn"
            data-comp="${esc(ov.id)}"
            data-event="${esc(ev.id)}"
            data-round="${esc(r.id)}"
            data-label="${esc(name)} — ${esc(lbl)}">
            <span class="scout-round-label">${lbl}</span>
            <span class="scout-round-meta">${fmt}${resultCount ? ` · ${resultCount} results` : ''}</span>
            <span style="color:var(--secondary-text)">›</span>
          </button>`;
                    })
                    .join('');

                return `
        <div class="scout-event-block">
          <div class="scout-event-header">
            <span class="scout-event-icon">${icon}</span>
            <span>${name}</span>
          </div>
          <div class="scout-rounds-list">${rounds}</div>
        </div>`;
            })
            .join('')}</div>`;

        $drawerBody.innerHTML = html;
        $drawerBody.querySelectorAll('.scout-round-btn').forEach((btn) => {
            btn.addEventListener('click', () =>
                openOverlay(
                    btn.dataset.comp,
                    btn.dataset.event,
                    btn.dataset.round,
                    btn.dataset.label,
                ),
            );
        });
    }

    // ── Overlay ─────────────────────────────────────────────
    async function openOverlay(compId, eventId, roundId, label) {
        stopTimer();
        currentAnalysis = { competitionId: compId, eventId, roundId };
        $overlayTitle.textContent = label || 'Round Analysis';
        $overlayBody.innerHTML =
            '<div class="scout-loading"><div class="scout-spinner"></div>Analysing competitors…</div>';
        $overlay.classList.add('open');

        await runAnalysis();

        // Auto-refresh every 120 s if competition is live
        if (currentComp?.status === 'ongoing') {
            liveTimer = setInterval(runAnalysis, 120_000);
        }
    }

    function closeOverlay() {
        $overlay.classList.remove('open');
        stopTimer();
        currentAnalysis = null;
    }

    function stopTimer() {
        if (liveTimer) {
            clearInterval(liveTimer);
            liveTimer = null;
        }
    }

    async function runAnalysis() {
        if (!currentAnalysis) return;
        const { competitionId, eventId, roundId } = currentAnalysis;

        // Cancel any in-flight stream
        if (streamAbortCtrl) {
            streamAbortCtrl.abort();
        }
        streamAbortCtrl = new AbortController();
        pendingProfiles = new Map();

        $refreshBtn.classList.add('spinning');

        // Reset to loading state but keep the table shell if it already exists
        $overlayBody.innerHTML = `
        <div class="scout-stream-status" id="scoutStreamStatus">
            <div class="scout-loading"><div class="scout-spinner"></div>Fetching competitor histories…</div>
        </div>`;

        try {
            const response = await fetch(
                `/api/competitions/${competitionId}/analyze/${eventId}/${roundId}/stream`,
                { signal: streamAbortCtrl.signal },
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process all complete newline-delimited JSON lines
                let nl;
                while ((nl = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, nl).trim();
                    buffer = buffer.slice(nl + 1);
                    if (!line) continue;

                    try {
                        const msg = JSON.parse(line);
                        handleStreamMessage(msg);
                    } catch (_) {
                        /* malformed line — skip */
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // user navigated away
            $overlayBody.innerHTML = `<div class="scout-empty">⚠️ Analysis failed.<br><small>${esc(err.message)}</small></div>`;
        } finally {
            $refreshBtn.classList.remove('spinning');
            streamAbortCtrl = null;
        }
    }

    // ── Handle each NDJSON message from the server ──────────────────────────

    function handleStreamMessage(msg) {
        switch (msg.type) {
            case 'meta': {
                // Render the table shell immediately with correct counts and
                // skeleton placeholder rows for every ranked competitor slot.
                const isLive = currentComp?.status === 'ongoing';
                currentAnalysis.meta = msg;

                let html = `
                <div class="scout-analysis-pills" id="scoutAnalysisPills">
                    <span class="scout-pill">Registered<strong>${msg.totalRegistered}</strong></span>
                    <span class="scout-pill">Ranked <strong id="scoutRankedCount">0</strong> / <strong>${msg.totalRegistered - msg.unranked.length}</strong></span>
                </div>
                ${isLive ? `<div class="scout-update-note" id="scoutUpdateNote">Live — fetching histories…</div>` : ''}
                <div class="scout-table-wrap">
                    <table class="scout-table" id="scoutRankTable">
                        <thead><tr>
                            <th style="width:36px">#</th>
                            <th id="scoutCompetitorHeaderSearch">Competitor</th>
                            <th class="r">Exp. time</th>
                            <th class="r">Podium %</th>
                            <th style="width:28px"></th>
                        </tr></thead>
                        <tbody id="scoutRankBody"></tbody>
                    </table>
                </div>`;

                // Append unranked rows at the bottom right away
                if (msg.unranked?.length) {
                    html += `<div id="scoutUnrankedBlock" style="margin-top:var(--space-xs)">
                        ${msg.unranked
                            .map(
                                (u) => `
                            <div class="scout-unranked-row">
                                <span class="scout-rank">—</span>
                                <span style="font-size:0.8rem;color:var(--secondary-text)">${esc(u.name)} <span style="opacity:0.6">(no history)</span></span>
                            </div>`,
                            )
                            .join('')}
                        </div>`;
                }

                $overlayBody.innerHTML = html;

                const th = document.getElementById('scoutCompetitorHeaderSearch');
                if (th) {
                    th.addEventListener('click', function handler(e) {
                        // Prevent multiple inputs
                        if (th.querySelector('input')) return;
                        const prev = th.textContent;
                        th.innerHTML = '';
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.placeholder = 'Competitor';
                        input.value = prev && prev !== 'Competitor' ? prev : '';
                        input.style.width = '90%';
                        input.autofocus = true;
                        th.appendChild(input);
                        input.focus();

                        // Live filter as user types
                        input.addEventListener('input', function () {
                            const val = input.value.trim().toLowerCase();
                            const rows = th.closest('table').querySelectorAll('tbody tr');
                            rows.forEach((row) => {
                                // Only filter ranked rows (skip unranked)
                                if (row.classList.contains('scout-unranked')) return;
                                const nameCell = row.querySelector('td:nth-child(2)');
                                if (!nameCell) return;
                                const name = nameCell.textContent.trim().toLowerCase();
                                row.style.display = !val || name.includes(val) ? '' : 'none';
                            });
                        });

                        // Restore header on blur or Enter
                        function restore() {
                            th.innerHTML = prev;
                        }

                        input.addEventListener('blur', restore);
                        input.addEventListener('keydown', function (e) {
                            if (e.key === 'Enter') {
                                input.blur();
                            } else if (e.key === 'Escape') {
                                input.value = '';
                                input.dispatchEvent(new Event('input'));
                                input.blur();
                            }
                        });
                    });
                }

                break;
            }

            case 'profile': {
                // A single competitor's history resolved — add a pending row
                pendingProfiles.set(msg.wcaId, msg);
                upsertPendingRow(msg);

                // Update "Ranked X / N" counter
                const rankedCount = document.getElementById('scoutRankedCount');
                if (rankedCount) rankedCount.textContent = pendingProfiles.size;
                break;
            }

            case 'rankings': {
                // All profiles done — replace pending rows with final ranked rows
                currentAnalysis.data = {
                    rankings: msg.rankings,
                    unranked: currentAnalysis.meta?.unranked || [],
                    totalRegistered: currentAnalysis.meta?.totalRegistered || 0,
                };
                lastRefresh = new Date();

                // Swap in final sorted rows with real probabilities
                renderFinalRankings(msg.rankings);

                // Update status line
                const note = document.getElementById('scoutUpdateNote');
                if (note) {
                    const isLive = currentComp?.status === 'ongoing';
                    note.textContent = `Updated ${lastRefresh.toLocaleTimeString()}${isLive ? ' · auto-refresh in 60 s' : ''}`;
                }

                // Update pill counter
                const rankedCount = document.getElementById('scoutRankedCount');
                if (rankedCount) rankedCount.textContent = msg.rankings.length;
                break;
            }

            case 'error': {
                const status = document.getElementById('scoutStreamStatus');
                if (status) {
                    status.innerHTML = `<div class="scout-empty">⚠️ ${esc(msg.message)}</div>`;
                }
                break;
            }

            // 'done' — nothing to do, stream closed naturally
        }
    }

    function upsertPendingRow(profileMsg) {
        const tbody = document.getElementById('scoutRankBody');
        if (!tbody) return;

        const rowId = `scout-row-${(profileMsg.wcaId || profileMsg.name).replace(/[^a-z0-9]/gi, '_')}`;
        let row = document.getElementById(rowId);

        const hasProfile = profileMsg.profile && !profileMsg.error;
        let expCs = null;
        if (hasProfile) {
            if (currentAnalysis?.eventId === '333fm') {
                expCs = profileMsg.profile.mean; // For FMC, use raw number
            } else {
                expCs = Math.round(profileMsg.profile.mean * 100);
            }
        }

        if (!row) {
            row = document.createElement('tr');
            row.id = rowId;
            row.className = 'scout-pending-row';
            tbody.appendChild(row);
        }

        row.innerHTML = `
        <td><span class="scout-rank">…</span></td>
        <td>
            ${flag(profileMsg.country || '')}
            ${esc(profileMsg.name)}
            ${profileMsg.profile?.type === 'live' ? '<span class="scout-live-dot" title="Live result"></span>' : ''}
            ${profileMsg.error ? '<span style="font-size:0.7rem;color:var(--color-warning-text);margin-left:4px">no data</span>' : ''}
        </td>
        <td class="r">
            <span class="scout-time">${
                expCs !== null && expCs !== undefined
                    ? currentAnalysis?.eventId === '333fm'
                        ? expCs
                        : fmtTime(expCs)
                    : '—'
            }</span>
        </td>
        <td class="r" colspan="2">
            <span style="font-size:0.72rem;color:var(--secondary-text);font-style:italic">computing…</span>
        </td>`;
    }

    function renderFinalRankings(rankings) {
        const tbody = document.getElementById('scoutRankBody');
        if (!tbody) return;

        tbody.innerHTML = rankings
            .map((r, i) => {
                const rank = i + 1;
                const rankCls =
                    rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                let expCs = null;
                if (r.profile?.mean) {
                    if (currentAnalysis?.eventId === '333fm') {
                        expCs = r.profile.mean;
                    } else {
                        expCs = Math.round(r.profile.mean * 100);
                    }
                }
                const pod = r.podiumProbability || 0;

                return `<tr data-idx="${i}" class="scout-ranked-row">
            <td><span class="scout-rank ${rankCls}">${rank}</span></td>
            <td>
                ${flag(r.countryIso2 || '')}
                ${esc(r.name)}
                ${r.profile?.type === 'live' ? '<span class="scout-live-dot" title="Live result"></span>' : ''}
            </td>
            <td class="r"><span class="scout-time">${
                expCs !== null && expCs !== undefined
                    ? currentAnalysis?.eventId === '333fm'
                        ? expCs.toFixed(2)
                        : fmtTime(expCs)
                    : '—'
            }</span></td>
            <td class="r">
                <div class="scout-prob-wrap">
                    <div class="scout-prob-bar">
                        <div class="scout-prob-fill" style="width:${Math.min(100, pod * 100).toFixed(1)}%"></div>
                    </div>
                    <span class="scout-prob-val">${fmtPct(pod)}</span>
                </div>
            </td>
            <td><button class="scout-inspect-btn" data-idx="${i}" title="Inspect ${esc(r.name)}" aria-label="Inspect ${esc(r.name)}"><i class="fa-solid fa-magnifying-glass"></i></button></td>
        </tr>`;
            })
            .join('');

        // Re-wire inspect buttons on the new rows
        tbody.querySelectorAll('.scout-inspect-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openInspector(parseInt(btn.dataset.idx));
            });
        });
        tbody.querySelectorAll('.scout-ranked-row').forEach((row) => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.idx);
                if (!isNaN(idx)) openInspector(idx);
            });
        });
    }

    function renderAnalysis(data) {
        const { rankings = [], unranked = [], totalRegistered = 0 } = data;
        const isLive = currentComp?.status === 'ongoing';

        let html = '';

        // Meta pills
        html += `<div class="scout-analysis-pills">
      <span class="scout-pill">Registered<strong>${totalRegistered}</strong></span>
      <span class="scout-pill">Ranked<strong>${rankings.length}</strong></span>
      <span class="scout-pill">Unranked<strong>${unranked.length}</strong></span>
    </div>`;

        if (lastRefresh) {
            html += `<div class="scout-update-note">Updated ${lastRefresh.toLocaleTimeString()}${isLive ? ' · auto-refresh in 60 s' : ''}</div>`;
        }

        if (rankings.length) {
            html += `<div class="scout-table-wrap"><table class="scout-table">
        <thead><tr>
          <th style="width:36px">#</th>
          <th>Competitor</th>
          <th class="r">Exp. time</th>
          <th class="r">Podium %</th>
          <th style="width:28px"></th>
        </tr></thead>
        <tbody>`;

            rankings.forEach((r, i) => {
                const rank = i + 1;
                const rankCls =
                    rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                const expCs = r.profile?.mean ? Math.round(r.profile.mean * 100) : null;
                const pod = r.podiumProbability || 0;

                html += `<tr data-idx="${i}">
          <td><span class="scout-rank ${rankCls}">${rank}</span></td>
          <td>
            ${flag(r.countryIso2)}
            ${esc(r.name)}
            ${r.profile?.type === 'live' ? '<span class="scout-live-dot" title="Live result"></span>' : ''}
          </td>
          <td class="r"><span class="scout-time">${expCs ? fmtTime(expCs) : '—'}</span></td>
          <td class="r">
            <div class="scout-prob-wrap">
              <div class="scout-prob-bar">
                <div class="scout-prob-fill" style="width:${Math.min(100, pod * 100).toFixed(1)}%"></div>
              </div>
              <span class="scout-prob-val">${fmtPct(pod)}</span>
            </div>
          </td>
          <td><button class="scout-inspect-btn" data-idx="${i}" title="Inspect competitor" aria-label="Inspect ${esc(r.name)}">🔍</button></td>
        </tr>`;
            });

            // Unranked
            unranked.forEach((u) => {
                html += `<tr class="scout-unranked">
          <td><span class="scout-rank">—</span></td>
          <td colspan="3" style="font-size:0.8rem;color:var(--secondary-text)">${esc(u.name)} <span style="opacity:0.6">(no history)</span></td>
          <td></td>
        </tr>`;
            });

            html += `</tbody></table></div>`;
        } else {
            html +=
                '<div class="scout-empty">No ranked competitors found for this round yet.</div>';
            if (unranked.length) {
                html += `<div style="margin-top:var(--space-sm)">${unranked
                    .map(
                        (u) =>
                            `<div style="padding:3px 0;font-size:0.82rem;color:var(--secondary-text)">${esc(u.name)}</div>`,
                    )
                    .join('')}</div>`;
            }
        }

        $overlayBody.innerHTML = html;

        // Wire inspect buttons
        $overlayBody.querySelectorAll('.scout-inspect-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openInspector(parseInt(btn.dataset.idx));
            });
        });
        // Row click → inspect
        $overlayBody.querySelectorAll('tbody tr:not(.scout-unranked)').forEach((row) => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.idx);
                if (!isNaN(idx)) openInspector(idx);
            });
        });
    }

    // ── Inspector ───────────────────────────────────────────
    async function openInspector(idx) {
        if (!currentAnalysis?.data) return;
        const competitor = currentAnalysis.data.rankings[idx];
        if (!competitor) return;

        // Destroy old chart
        if (inspectorChart) {
            inspectorChart.destroy();
            inspectorChart = null;
        }

        $inspAvatar.innerHTML = EVT_ICON[currentAnalysis.eventId] || '🎲';
        $inspName.textContent = competitor.name;
        $inspSub.innerHTML = `
      <span>${flag(competitor.countryIso2)} ${esc(competitor.countryIso2 || 'Unknown')}</span>
      ${
          competitor.wcaId
              ? `<a href="https://www.worldcubeassociation.org/persons/${esc(competitor.wcaId)}"
             target="_blank" rel="noopener">${esc(competitor.wcaId)}</a>`
              : ''
      }
      <span>Expected rank: <strong style="color:var(--main-text)">#${idx + 1}</strong></span>`;

        $inspBody.innerHTML =
            '<div class="scout-loading"><div class="scout-spinner"></div>Loading…</div>';
        $inspector.classList.add('open');

        let solveData = null;
        let prData = null;
        if (competitor.wcaId) {
            const eventId = currentAnalysis.eventId;
            try {
                solveData = await apiFetch(
                    `/api/wca/${competitor.wcaId}/${eventId}?getsolves=true`,
                );
            } catch (_) {}
            try {
                prData = await apiFetch(`/api/wca/${competitor.wcaId}/${eventId}`);
            } catch (_) {}
        }

        renderInspector(competitor, idx, solveData, prData);
    }

    function renderInspector(competitor, idx, solveData, prData) {
        const { profile, winProbability, podiumProbability, top8Probability, pairwiseWinRates } =
            competitor;
        const rankings = currentAnalysis.data.rankings;
        let html = '';

        // PRs
        html += `<div>
      <div class="scout-section-label">Personal Records</div>
      <div class="scout-pr-grid">
        <div class="scout-pr-card">
          <div class="scout-pr-label">PR Single</div>
          <div class="scout-pr-value">${prData?.records?.single ? fmtTime(prData.records.single) : '—'}</div>
        </div>
        <div class="scout-pr-card">
          <div class="scout-pr-label">PR Average</div>
          <div class="scout-pr-value">${prData?.records?.average ? fmtTime(prData.records.average) : '—'}</div>
        </div>
        <div class="scout-pr-card">
          <div class="scout-pr-label">Model mean</div>
          <div class="scout-pr-value accent">${profile?.mean ? fmtTime(Math.round(profile.mean * 100)) : '—'}</div>
          <div class="scout-pr-sub">${profile?.sampleSize ? `${profile.sampleSize} comp${profile.sampleSize !== 1 ? 's' : ''}` : 'Insufficient data'}</div>
        </div>
        <div class="scout-pr-card">
          <div class="scout-pr-label">Std deviation σ</div>
          <div class="scout-pr-value" style="color:var(--secondary-text)">${profile?.stdDev ? '±' + fmtTime(Math.round(profile.stdDev * 100)) : '—'}</div>
        </div>
      </div>
    </div>`;

        // Rank probabilities
        html += `<div>
      <div class="scout-section-label">Ranking Probabilities</div>
      <div class="scout-rankprob-list">
        ${probRow('🥇 Win (1st)', winProbability, 'win')}
        ${probRow('🥈 Podium (top 3)', podiumProbability, 'podium')}
        ${probRow('🏅 Top 8', top8Probability, 'top8')}
      </div>
    </div>`;

        // History chart placeholder
        const solves = solveData?.allResults?.filter((t) => t > 0).slice(0, 100) || [];
        if (solves.length) {
            html += `<div>
                        <div class="scout-section-label">Recent Solve History (last ${solves.length})</div>
                        <div class="scout-chart-wrap">
                        <canvas id="scoutInspChart"></canvas>
                        </div>
                    </div>`;
        }

        // Pairwise
        if (pairwiseWinRates && rankings.length > 1) {
            const pairs = rankings
                .filter((r) => r.wcaId !== competitor.wcaId)
                .map((r) => ({ name: r.name, win: pairwiseWinRates[r.wcaId] || 0 }))
                .sort((a, b) => b.win - a.win);

            html += `<div>
                        <div class="scout-section-label">Head-to-Head vs Field</div>
                        <div class="scout-pairwise-list">
                        <div class="scout-pairwise-head">
                            <span>Opponent</span><span style="text-align:right">Win %</span><span style="text-align:right">Lose %</span>
                    </div>
          ${pairs
              .map(
                  (p) => `
                    <div class="scout-pairwise-row">
                        <span class="scout-pairwise-name">${esc(p.name)}</span>
                        <span class="scout-pairwise-win">${fmtPct(p.win)}</span>
                        <span class="scout-pairwise-lose">${fmtPct(1 - p.win)}</span>
                    </div>`,
              )
              .join('')}
                    </div>
                </div>`;
        }

        $inspBody.innerHTML = html;

        // Draw history chart
        if (solves.length && window.Chart) {
            const canvas = document.getElementById('scoutInspChart');
            if (canvas) {
                const rootStyles = getComputedStyle(document.documentElement);
                const linkColor = rootStyles.getPropertyValue('--link-color').trim();
                const secondaryText = rootStyles.getPropertyValue('--secondary-text').trim();
                const mainLighter = rootStyles.getPropertyValue('--main-lighter').trim();

                // For FMC, use raw values; for others, cs/100
                const isFMC = currentAnalysis?.eventId === '333fm';
                const displaySolves = [...solves]
                    .reverse()
                    .map((cs) => (isFMC ? cs : +(cs / 100).toFixed(2)));

                // Calculate model mean
                const modelMean = displaySolves.length
                    ? displaySolves.reduce((a, b) => a + b, 0) / displaySolves.length
                    : 0;

                // Calculate trend line (linear regression)
                function calcTrendLine(data) {
                    const n = data.length;
                    if (n < 2) return Array(n).fill(data[0] || 0);
                    let sumX = 0,
                        sumY = 0,
                        sumXY = 0,
                        sumXX = 0;
                    for (let i = 0; i < n; i++) {
                        const x = i + 1;
                        const y = data[i];
                        sumX += x;
                        sumY += y;
                        sumXY += x * y;
                        sumXX += x * x;
                    }
                    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                    const intercept = (sumY - slope * sumX) / n;
                    return data.map((_, i) => slope * (i + 1) + intercept);
                }
                const trendLine = calcTrendLine(displaySolves);

                inspectorChart = new window.Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: displaySolves.map((_, i) => i + 1),
                        datasets: [
                            // red dotted line for model mean
                            {
                                data: Array(displaySolves.length).fill(modelMean),
                                borderColor: 'red',
                                borderWidth: 1.5,
                                borderDash: [6, 6],
                                pointRadius: 0,
                                fill: false,
                                label: 'Mean',
                                order: 0,
                            },
                            // greenf dotted line for trend
                            {
                                data: trendLine,
                                borderColor: 'green',
                                borderWidth: 1.5,
                                borderDash: [5, 6],
                                pointRadius: 0,
                                fill: false,
                                label: 'Trend',
                                order: 1,
                            },
                            {
                                data: displaySolves,
                                borderColor: linkColor,
                                borderWidth: 1.5,
                                pointRadius: displaySolves.length > 40 ? 0 : 2,
                                pointHoverRadius: 4,
                                pointBackgroundColor: linkColor,
                                backgroundColor: linkColor + '18',
                                fill: true,
                                tension: 0.35,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 400 },
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { display: false },
                            y: {
                                grid: { color: mainLighter },
                                ticks: {
                                    color: secondaryText,
                                    font: { family: 'Courier New', size: 10 },
                                    maxTicksLimit: 5,
                                },
                            },
                        },
                    },
                });
            }
        }
    }

    function probRow(label, prob, cls) {
        const w = prob != null ? Math.min(100, prob * 100).toFixed(1) : '0';
        return `<div class="scout-rankprob-row">
      <span class="scout-rankprob-label">${label}</span>
      <div class="scout-rankprob-track">
        <div class="scout-rankprob-fill ${cls}" style="width:${w}%"></div>
      </div>
      <span class="scout-rankprob-pct">${fmtPct(prob)}</span>
    </div>`;
    }

    function closeInspector() {
        $inspector.classList.remove('open');
        if (inspectorChart) {
            inspectorChart.destroy();
            inspectorChart = null;
        }
    }

    // ── Event wiring ────────────────────────────────────────
    $search.addEventListener(
        'input',
        debounce((e) => {
            searchQuery = e.target.value.trim();
            $searchClear.style.display = searchQuery ? 'block' : 'none';
            renderList();
        }, 280),
    );

    $searchClear.addEventListener('click', () => {
        $search.value = '';
        searchQuery = '';
        $searchClear.style.display = 'none';
        renderList();
    });

    document.querySelectorAll('.scout-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.scout-chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            activeFilter = chip.dataset.filter;
            renderList();
        });
    });

    $country.addEventListener('change', loadCompetitions);
    $backdrop.addEventListener('click', closeDrawer);
    $drawerClose.addEventListener('click', closeDrawer);
    $overlayBack.addEventListener('click', closeOverlay);
    $refreshBtn.addEventListener('click', runAnalysis);
    $inspBg.addEventListener('click', closeInspector);
    $inspClose.addEventListener('click', closeInspector);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if ($inspector.classList.contains('open')) closeInspector();
        else if ($overlay.classList.contains('open')) closeOverlay();
        else if ($drawer.classList.contains('open')) closeDrawer();
    });

    // ── Boot ────────────────────────────────────────────────
    loadCompetitions();
})();
