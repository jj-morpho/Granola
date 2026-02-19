/**
 * Weekly Integrator Notes — Frontend
 *
 * Loads summary data from summaries/index.json, renders the sidebar week list,
 * and displays the selected week's summary (markdown rendered to HTML).
 */

(function () {
    "use strict";

    const SUMMARIES_INDEX = "summaries/index.json";
    const sidebar = document.getElementById("sidebar");
    const weekList = document.getElementById("week-list");
    const summaryEl = document.getElementById("summary");
    const headerMeta = document.getElementById("header-meta");
    const menuToggle = document.getElementById("menu-toggle");

    let weeks = [];
    let overlay = null;

    // ── Bootstrap ──────────────────────────────────────────────
    async function init() {
        createOverlay();
        menuToggle.addEventListener("click", toggleSidebar);

        try {
            const resp = await fetch(SUMMARIES_INDEX);
            if (!resp.ok) throw new Error(`${resp.status}`);
            const data = await resp.json();
            weeks = (data.weeks || []).sort(
                (a, b) => new Date(b.week_start) - new Date(a.week_start)
            );
        } catch (e) {
            weekList.innerHTML = `<div class="loading-weeks">No summaries yet. Check back after Monday.</div>`;
            return;
        }

        if (weeks.length === 0) {
            weekList.innerHTML = `<div class="loading-weeks">No summaries yet.</div>`;
            return;
        }

        renderWeekList();

        // Auto-select from URL hash or latest
        const hash = window.location.hash.replace("#", "");
        const target = weeks.find((w) => w.week_start === hash) || weeks[0];
        selectWeek(target.week_start);
    }

    // ── Sidebar week list ──────────────────────────────────────
    function renderWeekList() {
        weekList.innerHTML = "";
        for (const week of weeks) {
            const btn = document.createElement("button");
            btn.className = "week-item";
            btn.dataset.week = week.week_start;
            btn.innerHTML = `
                <span class="week-date">${formatDateRange(week.week_start, week.week_end)}</span>
                <span class="week-note-count">${week.note_count} meeting${week.note_count !== 1 ? "s" : ""} analyzed</span>
            `;
            btn.addEventListener("click", () => selectWeek(week.week_start));
            weekList.appendChild(btn);
        }
    }

    // ── Select & render a week ────────────────────────────────
    async function selectWeek(weekStart) {
        // Update sidebar active state
        weekList.querySelectorAll(".week-item").forEach((el) => {
            el.classList.toggle("active", el.dataset.week === weekStart);
        });

        window.location.hash = weekStart;
        closeSidebar();

        const week = weeks.find((w) => w.week_start === weekStart);
        if (!week) return;

        // Update header
        headerMeta.innerHTML = `
            <strong>${formatDateRange(week.week_start, week.week_end)}</strong>
            &nbsp;&middot;&nbsp; ${week.note_count} meetings
            &nbsp;&middot;&nbsp; Generated ${formatDate(week.generated_at)}
        `;

        // Load the summary file
        summaryEl.innerHTML = `<div class="loading-weeks" style="padding:40px 0">Loading summary...</div>`;

        try {
            const resp = await fetch(`summaries/${week.file}`);
            if (!resp.ok) throw new Error(`${resp.status}`);
            const data = await resp.json();
            renderSummary(data, week);
        } catch (e) {
            summaryEl.innerHTML = `<div class="empty-state"><p>Could not load summary for this week.</p></div>`;
        }
    }

    // ── Render a summary ──────────────────────────────────────
    function renderSummary(data, week) {
        const html = [];

        // Stats bar
        html.push(`<div class="stats-bar">`);
        html.push(stat(week.note_count, "Meetings"));
        if (data.theme_count) html.push(stat(data.theme_count, "Themes"));
        if (data.friction_count) html.push(stat(data.friction_count, "Friction Points"));
        if (data.idea_count) html.push(stat(data.idea_count, "Content Ideas"));
        html.push(`</div>`);

        // If we have structured markdown, render it
        if (data.summary_markdown) {
            html.push(`<div class="markdown-content">${renderMarkdown(data.summary_markdown)}</div>`);
        }

        // If we have raw_summary (plain text fallback), render it as markdown too
        if (!data.summary_markdown && data.raw_summary) {
            html.push(`<div class="markdown-content">${renderMarkdown(data.raw_summary)}</div>`);
        }

        summaryEl.innerHTML = html.join("");
    }

    // ── Minimal Markdown → HTML renderer ──────────────────────
    function renderMarkdown(md) {
        let html = md
            // Escape HTML
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Headings
        html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
        html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
        html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

        // Horizontal rules
        html = html.replace(/^---$/gm, "<hr>");

        // Bold & italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

        // Inline code
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

        // Blockquotes (consecutive lines)
        html = html.replace(
            /(?:^&gt; .+\n?)+/gm,
            (match) => {
                const inner = match.replace(/^&gt; /gm, "").trim();
                return `<blockquote>${inner}</blockquote>\n`;
            }
        );

        // Unordered lists
        html = html.replace(
            /(?:^- .+\n?)+/gm,
            (match) => {
                const items = match
                    .trim()
                    .split("\n")
                    .map((l) => `<li>${l.replace(/^- /, "")}</li>`)
                    .join("");
                return `<ul>${items}</ul>\n`;
            }
        );

        // Ordered lists
        html = html.replace(
            /(?:^\d+\. .+\n?)+/gm,
            (match) => {
                const items = match
                    .trim()
                    .split("\n")
                    .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
                    .join("");
                return `<ol>${items}</ol>\n`;
            }
        );

        // Paragraphs: wrap remaining loose text lines
        html = html
            .split("\n\n")
            .map((block) => {
                block = block.trim();
                if (!block) return "";
                if (
                    block.startsWith("<h") ||
                    block.startsWith("<ul") ||
                    block.startsWith("<ol") ||
                    block.startsWith("<blockquote") ||
                    block.startsWith("<hr")
                ) {
                    return block;
                }
                return `<p>${block.replace(/\n/g, "<br>")}</p>`;
            })
            .join("\n");

        return html;
    }

    // ── Helpers ───────────────────────────────────────────────
    function stat(value, label) {
        return `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;
    }

    function formatDateRange(start, end) {
        const s = new Date(start + "T00:00:00");
        const e = new Date(end + "T00:00:00");
        const opts = { month: "short", day: "numeric" };
        const startStr = s.toLocaleDateString("en-US", opts);
        const endStr = e.toLocaleDateString("en-US", {
            ...opts,
            year: "numeric",
        });
        return `${startStr} – ${endStr}`;
    }

    function formatDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }

    // ── Mobile sidebar ────────────────────────────────────────
    function createOverlay() {
        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        overlay.addEventListener("click", closeSidebar);
        document.body.appendChild(overlay);
    }

    function toggleSidebar() {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("active");
    }

    function closeSidebar() {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
    }

    // ── Go ────────────────────────────────────────────────────
    init();
})();
