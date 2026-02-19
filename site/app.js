/**
 * Integrator Notes — Frontend
 *
 * Loads summary data from summaries/index.json, parses the markdown into
 * structured sections, and renders them as actionable cards.
 * Supports 7-day and 28-day rolling views via tabs.
 */

(function () {
    "use strict";

    const SUMMARIES_INDEX = "summaries/index.json";
    const summaryEl = document.getElementById("summary");
    const headerMeta = document.getElementById("header-meta");
    const tabBar = document.getElementById("tab-bar");

    let allWeeks = [];   // sorted newest-first
    let allSummaries = {}; // keyed by week_start
    let activeTab = "7";

    // ── Bootstrap ──────────────────────────────────────────────
    async function init() {
        tabBar.addEventListener("click", onTabClick);

        try {
            const resp = await fetch(SUMMARIES_INDEX);
            if (!resp.ok) throw new Error(resp.status);
            const data = await resp.json();
            allWeeks = (data.weeks || []).sort(
                (a, b) => new Date(b.week_start) - new Date(a.week_start)
            );
        } catch (e) {
            summaryEl.innerHTML = '<div class="empty-state"><p>No summaries yet. Check back after Monday.</p></div>';
            return;
        }

        if (allWeeks.length === 0) {
            summaryEl.innerHTML = '<div class="empty-state"><p>No summaries yet.</p></div>';
            return;
        }

        // Pre-load all summary files
        await Promise.all(allWeeks.map(loadSummary));

        renderTab(activeTab);
    }

    async function loadSummary(week) {
        try {
            const resp = await fetch("summaries/" + week.file);
            if (!resp.ok) throw new Error(resp.status);
            allSummaries[week.week_start] = await resp.json();
        } catch (e) {
            // skip failed loads
        }
    }

    // ── Tab Switching ──────────────────────────────────────────
    function onTabClick(e) {
        const btn = e.target.closest(".tab");
        if (!btn) return;
        const tab = btn.dataset.tab;
        if (tab === activeTab) return;

        activeTab = tab;
        tabBar.querySelectorAll(".tab").forEach(
            (t) => t.classList.toggle("active", t.dataset.tab === tab)
        );
        renderTab(tab);
    }

    // ── Render a Tab ───────────────────────────────────────────
    function renderTab(tab) {
        const days = parseInt(tab, 10);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        // Filter weeks that overlap with the window
        const weeksInRange = allWeeks.filter((w) => new Date(w.week_end) >= cutoff);

        if (weeksInRange.length === 0) {
            summaryEl.innerHTML = '<div class="empty-state"><p>No data for this period yet.</p></div>';
            headerMeta.textContent = "No data available";
            return;
        }

        // Collect all parsed sections from matching weeks
        const merged = {
            insights: [],
            quotes: [],
            themes: [],
            frictions: [],
            ideas: [],
            noteCount: 0,
            meetingCount: 0,
        };

        for (const week of weeksInRange) {
            const data = allSummaries[week.week_start];
            if (!data) continue;

            merged.noteCount += week.note_count || 0;

            const sections = parseSummary(data.summary_markdown || data.raw_summary || "");
            merged.insights.push(...sections.insights);
            merged.quotes.push(...sections.quotes);
            merged.themes.push(...sections.themes);
            merged.frictions.push(...sections.frictions);
            merged.ideas.push(...sections.ideas);
        }

        // Date range label
        const rangeStart = weeksInRange[weeksInRange.length - 1].week_start;
        const rangeEnd = weeksInRange[0].week_end;

        headerMeta.innerHTML =
            "<strong>" + formatDateRange(rangeStart, rangeEnd) + "</strong>" +
            " &middot; " + merged.noteCount + " meetings analyzed";

        // Build HTML
        const html = [];

        // Stats bar
        html.push('<div class="stats-bar">');
        html.push(stat(merged.noteCount, "Meetings"));
        html.push(stat(merged.themes.length, "Themes"));
        html.push(stat(merged.frictions.length, "Friction Points"));
        html.push(stat(merged.ideas.length, "Content Ideas"));
        html.push("</div>");

        // Date range
        html.push('<div class="date-range-banner">Covering ' + formatDateRange(rangeStart, rangeEnd) + "</div>");

        // 1. Insights
        if (merged.insights.length > 0) {
            html.push('<div class="section">');
            html.push('<h2 class="section-title">Insights</h2>');
            for (const item of merged.insights) {
                html.push('<div class="card card--insight"><div class="card-body">' + escapeHtml(item) + "</div></div>");
            }
            html.push("</div>");
        }

        // 2. Sources (quotes)
        if (merged.quotes.length > 0) {
            html.push('<div class="section">');
            html.push('<h2 class="section-title">Sources</h2>');
            for (const q of merged.quotes) {
                html.push('<div class="card card--quote">');
                html.push('<div class="quote-text">"' + escapeHtml(q.text) + '"</div>');
                html.push('<div class="quote-attribution">' + escapeHtml(q.attribution));
                if (q.org) {
                    html.push(' <span class="quote-org">&mdash; ' + escapeHtml(q.org) + "</span>");
                }
                html.push("</div></div>");
            }
            html.push("</div>");
        }

        // 3. Themes
        if (merged.themes.length > 0) {
            html.push('<div class="section">');
            html.push('<h2 class="section-title">Themes</h2>');
            for (const t of merged.themes) {
                html.push('<div class="card card--theme">');
                html.push('<div class="card-title">' + escapeHtml(t.title) + "</div>");
                html.push('<div class="card-body">' + escapeHtml(t.body) + "</div>");
                if (t.mentions) {
                    html.push('<div class="card-meta">Mentioned by: ' + escapeHtml(t.mentions) + "</div>");
                }
                html.push("</div>");
            }
            html.push("</div>");
        }

        // 4. Friction Points
        if (merged.frictions.length > 0) {
            html.push('<div class="section">');
            html.push('<h2 class="section-title">Friction Points</h2>');
            for (const f of merged.frictions) {
                html.push('<div class="card card--friction">');
                html.push('<div class="card-title">' + escapeHtml(f.title) + "</div>");
                html.push('<div class="card-body">' + escapeHtml(f.body) + "</div>");
                html.push("</div>");
            }
            html.push("</div>");
        }

        // 5. Content Ideas
        if (merged.ideas.length > 0) {
            html.push('<div class="section">');
            html.push('<h2 class="section-title">Content Ideas</h2>');
            for (const idea of merged.ideas) {
                html.push('<div class="card card--idea">');
                html.push('<div class="card-title">' + escapeHtml(idea.title) + "</div>");
                html.push('<div class="card-body">' + escapeHtml(idea.body) + "</div>");
                html.push("</div>");
            }
            html.push("</div>");
        }

        summaryEl.innerHTML = html.join("");
    }

    // ── Parse summary markdown into structured sections ────────
    function parseSummary(md) {
        const result = {
            insights: [],
            quotes: [],
            themes: [],
            frictions: [],
            ideas: [],
        };

        // Split into heading-delimited sections
        var sections = md.split(/^## \d+\.\s*/m);

        for (var i = 0; i < sections.length; i++) {
            var section = sections[i].trim();
            if (!section) continue;

            var firstLine = section.split("\n")[0].toLowerCase();
            var body = section.substring(section.indexOf("\n") + 1).trim();

            if (firstLine.indexOf("executive summary") !== -1 || firstLine.indexOf("insight") !== -1) {
                // Split executive summary into individual sentences/insights
                var paragraphs = body.split("\n\n").filter(Boolean);
                for (var j = 0; j < paragraphs.length; j++) {
                    var p = paragraphs[j].trim();
                    if (p) result.insights.push(p);
                }
            } else if (firstLine.indexOf("notable quotes") !== -1 || firstLine.indexOf("source") !== -1) {
                result.quotes = parseQuotes(body);
            } else if (firstLine.indexOf("main themes") !== -1 || firstLine.indexOf("theme") !== -1) {
                result.themes = parseBulletCards(body);
            } else if (firstLine.indexOf("misunderstanding") !== -1 || firstLine.indexOf("friction") !== -1) {
                result.frictions = parseFrictionCards(body);
            } else if (firstLine.indexOf("content idea") !== -1) {
                result.ideas = parseIdeaCards(body);
            }
        }

        return result;
    }

    // ── Parse quotes: "> quote text" — Attribution ────────────
    function parseQuotes(text) {
        var quotes = [];
        // Match blockquote lines: > "quote text" — Attribution
        var regex = />\s*"([^"]+)"\s*(?:—|--|-)\s*(.+)/g;
        var match;
        while ((match = regex.exec(text)) !== null) {
            var quoteText = match[1].trim();
            var attr = match[2].trim();
            // Try to split "person, org" or "role — org" patterns
            var org = "";
            var person = attr;
            // Check for "team member" or "team" patterns
            var teamMatch = attr.match(/^(.+?)\s+(?:team\s+member|team)\s*$/i);
            if (teamMatch) {
                person = attr;
                org = teamMatch[1];
            }
            // Check for comma-separated: "Name, Org"
            var commaMatch = attr.match(/^(.+?),\s*(.+)$/);
            if (commaMatch) {
                person = commaMatch[1];
                org = commaMatch[2];
            }
            quotes.push({ text: quoteText, attribution: person, org: org });
        }
        return quotes;
    }

    // ── Parse bullet-point cards with bold titles ─────────────
    function parseBulletCards(text) {
        var cards = [];
        // Match lines like: - **Title** — description. Mentioned by: X, Y.
        var lines = text.split("\n- ");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^-\s*/, "").trim();
            if (!line) continue;
            var titleMatch = line.match(/^\*\*(.+?)\*\*\s*(?:—|--|-|:)\s*/);
            if (titleMatch) {
                var title = titleMatch[1];
                var rest = line.substring(titleMatch[0].length).trim();
                var mentions = "";
                var mentionMatch = rest.match(/Mentioned by:\s*(.+?)\.?\s*$/i);
                if (mentionMatch) {
                    mentions = mentionMatch[1];
                    rest = rest.substring(0, mentionMatch.index).trim();
                }
                // Clean trailing period
                if (rest.endsWith(".")) rest = rest.slice(0, -1);
                cards.push({ title: title, body: rest, mentions: mentions });
            } else if (line.length > 10) {
                cards.push({ title: "", body: line, mentions: "" });
            }
        }
        return cards;
    }

    // ── Parse friction points: **Title** — body ──────────────
    function parseFrictionCards(text) {
        var cards = [];
        // Split on bold-titled paragraphs
        var parts = text.split(/\n(?=- \*\*)/);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim().replace(/^-\s*/, "");
            if (!part) continue;
            var titleMatch = part.match(/^\*\*(.+?)\*\*\s*(?:—|--|-|:)\s*/);
            if (titleMatch) {
                var title = titleMatch[1];
                var body = part.substring(titleMatch[0].length).trim();
                cards.push({ title: title, body: body });
            } else if (part.length > 10) {
                cards.push({ title: "", body: part });
            }
        }
        return cards;
    }

    // ── Parse content ideas: **Title** — body ────────────────
    function parseIdeaCards(text) {
        var cards = [];
        var lines = text.split("\n- ");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^-\s*/, "").trim();
            if (!line) continue;
            var titleMatch = line.match(/^\*\*(.+?)\*\*\s*(?:—|--|-|:)\s*/);
            if (titleMatch) {
                var title = titleMatch[1];
                var body = line.substring(titleMatch[0].length).trim();
                cards.push({ title: title, body: body });
            } else if (line.length > 10) {
                cards.push({ title: "", body: line });
            }
        }
        return cards;
    }

    // ── Helpers ───────────────────────────────────────────────
    function stat(value, label) {
        return '<div class="stat"><span class="stat-value">' + value + '</span><span class="stat-label">' + label + "</span></div>";
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatDateRange(start, end) {
        var s = new Date(start + "T00:00:00");
        var e = new Date(end + "T00:00:00");
        var opts = { month: "short", day: "numeric" };
        var startStr = s.toLocaleDateString("en-US", opts);
        var endStr = e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return startStr + " – " + endStr;
    }

    // ── Go ────────────────────────────────────────────────────
    init();
})();
