(function () {
  "use strict";

  const BTN_CLASS = "punchly-reporter-summarize-btn";
  const SEP = " • ";

  /** Captured from app.punchly.work/en/time-tracker — may shift if layout changes. */
  const XP_TOTAL =
    "/html/body/div[2]/div/main/div/div[3]/div[1]/div[2]/div[1]/div[1]/div[2]";
  const XP_TODAY_TASKS =
    "/html/body/div[2]/div/main/div/div[3]/div[1]/div[2]/div[1]/div[2]";

  function byXPath(xpath) {
    return document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }

  function findTotalByText() {
    const it = document.evaluate(
      "//text()[contains(., 'Total:')]",
      document,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null
    );
    let n;
    while ((n = it.iterateNext())) {
      const t = (n.textContent || "").trim();
      if (/^Total:\s*\d{1,2}:\d{2}:\d{2}/.test(t)) {
        return n.parentElement;
      }
    }
    return null;
  }

  function findTotalElement() {
    return byXPath(XP_TOTAL) || findTotalByText();
  }

  /** Task list for Today only (sibling of the header row that contains Total). */
  function findTodayTasksContainer(totalEl) {
    const byPath = byXPath(XP_TODAY_TASKS);
    if (byPath) return byPath;
    if (totalEl) {
      const inner = totalEl.parentElement?.parentElement;
      const next = inner?.nextElementSibling;
      if (next) return next;
    }
    return null;
  }

  function isTimeTrackerPage() {
    return /\/en\/time-tracker/.test(location.pathname);
  }

  function normalizeTimeStr(h, min, sec) {
    const hh = String(parseInt(h, 10)).padStart(2, "0");
    return `${hh}:${min}:${sec}`;
  }

  function parseTimeToSeconds(timeStr) {
    const m = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return (
      parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
    );
  }

  function formatTotalHours(seconds) {
    if (seconds <= 0) return "0min";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}min`;
    return `${h}h ${String(m).padStart(2, "0")}min`;
  }

  function parseLabelAndTime(labelText, timeStr) {
    if (!labelText || !timeStr) return null;
    const m = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const time = normalizeTimeStr(m[1], m[2], m[3]);

    const sepIdx = labelText.indexOf(SEP);
    if (sepIdx === -1) return null;
    const projectPart = labelText.slice(0, sepIdx).trim();
    const taskName = labelText.slice(sepIdx + SEP.length).trim();
    if (!projectPart || !taskName) return null;

    return {
      project: projectPart,
      task: taskName,
      time,
      seconds: parseTimeToSeconds(time),
    };
  }

  function rowLabelAndTimeElements(row) {
    let labelEl = row.querySelector("div:nth-child(3) button div span");
    let timeEl = row.querySelector("div:nth-child(5) span");
    if (labelEl && timeEl) return { labelEl, timeEl };

    const idx = Array.prototype.indexOf.call(row.parentElement?.children || [], row);
    if (idx < 0 || !row.parentElement) return { labelEl: null, timeEl: null };
    labelEl = byXPath(`${XP_TODAY_TASKS}/div[${idx + 1}]/div[3]/button/div/span`);
    timeEl = byXPath(`${XP_TODAY_TASKS}/div[${idx + 1}]/div[5]/span`);
    return { labelEl, timeEl };
  }

  function scrapeTodayTasks(totalEl) {
    const container = findTodayTasksContainer(totalEl);
    if (!container) return [];

    const tasks = [];
    for (const row of Array.from(container.children)) {
      const { labelEl, timeEl } = rowLabelAndTimeElements(row);
      const labelText = labelEl?.textContent?.trim();
      const timeStr = timeEl?.textContent?.trim();
      const parsed = parseLabelAndTime(labelText, timeStr);
      if (parsed) tasks.push(parsed);
    }
    return tasks;
  }

  function groupByProject(tasks) {
    const map = new Map();
    for (const t of tasks) {
      if (!map.has(t.project)) map.set(t.project, []);
      map.get(t.project).push(t);
    }
    return map;
  }

  let observer = null;
  let tryTimer = null;
  let tryTimer2 = null;

  function removeOurButtons() {
    document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove());
  }

  function cleanupOrphanButtons(anchorParent) {
    document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => {
      if (!anchorParent || !anchorParent.contains(b)) b.remove();
    });
  }

  function injectSummarizeButton(totalEl) {
    if (!totalEl || !totalEl.parentNode) return;
    if (totalEl.parentNode.querySelector(`:scope > .${BTN_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.textContent = "Summarize";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const freshTotal = findTotalElement();
      const tasks = scrapeTodayTasks(freshTotal || totalEl);
      openFloatingCard(btn, tasks);
    });

    totalEl.parentNode.insertBefore(btn, totalEl);
  }

  function tryInject() {
    if (!isTimeTrackerPage()) {
      removeOurButtons();
      return;
    }

    const totalEl = findTotalElement();
    if (!totalEl || !totalEl.parentNode) {
      removeOurButtons();
      return;
    }

    cleanupOrphanButtons(totalEl.parentNode);
    injectSummarizeButton(totalEl);
  }

  function scheduleTryInject() {
    if (tryTimer) clearTimeout(tryTimer);
    if (tryTimer2) clearTimeout(tryTimer2);
    tryInject();
    tryTimer = setTimeout(tryInject, 1500);
    tryTimer2 = setTimeout(tryInject, 4000);
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      tryInject();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleTryInject();
  }

  startObserver();
  window.addEventListener("popstate", tryInject);

  // ——— Floating card ———

  function ensureCardHost() {
    let backdrop = document.getElementById("punchly-reporter-backdrop");
    if (backdrop) return { backdrop, card: backdrop.querySelector(".punchly-reporter-card") };

    backdrop = document.createElement("div");
    backdrop.id = "punchly-reporter-backdrop";
    backdrop.className = "punchly-reporter-backdrop";
    backdrop.setAttribute("role", "presentation");

    const card = document.createElement("div");
    card.className = "punchly-reporter-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeCard(backdrop);
    });

    return { backdrop, card };
  }

  function positionCard(anchorBtn, card) {
    const r = anchorBtn.getBoundingClientRect();
    const margin = 12;
    let top = r.bottom + margin;
    let left = r.left - 8;
    const cw = card.offsetWidth || 400;
    const maxLeft = window.innerWidth - cw - margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    if (left < margin) left = margin;

    const ch = Math.min(card.offsetHeight || 400, window.innerHeight * 0.8);
    if (top + ch > window.innerHeight - margin) {
      top = Math.max(margin, r.top - ch - margin);
    }

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function closeCard(backdrop) {
    if (backdrop && backdrop.parentNode) backdrop.remove();
  }

  function renderProjectList(card, tasks, anchorBtn) {
    const projects = [...new Set(tasks.map((t) => t.project))];

    card.innerHTML = "";

    const header = document.createElement("div");
    header.className = "punchly-reporter-card-header";

    const title = document.createElement("h2");
    title.className = "punchly-reporter-card-title";
    title.textContent = "Select a Project";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "punchly-reporter-card-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => {
      closeCard(card.closest("#punchly-reporter-backdrop"));
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "punchly-reporter-card-body";

    if (projects.length === 0) {
      const empty = document.createElement("div");
      empty.className = "punchly-reporter-empty";
      empty.textContent = "No tasks found for Today.";
      body.appendChild(empty);
    } else {
      const grouped = groupByProject(tasks);
      for (const name of projects) {
        const row = document.createElement("div");
        row.className = "punchly-reporter-project-row";
        row.textContent = name;
        row.addEventListener("click", () => {
          renderTaskView(card, tasks, anchorBtn, name, grouped.get(name) || []);
        });
        body.appendChild(row);
      }
    }

    card.appendChild(header);
    card.appendChild(body);

    requestAnimationFrame(() => positionCard(anchorBtn, card));
  }

  function renderTaskView(card, allTasks, anchorBtn, projectName, projectTasks) {
    const state = projectTasks.map((t) => ({
      task: t.task,
      time: t.time,
      seconds: t.seconds,
      status: "progress",
    }));

    card.innerHTML = "";

    const header = document.createElement("div");
    header.className = "punchly-reporter-card-header";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "punchly-reporter-back-btn";
    back.setAttribute("aria-label", "Back");
    back.textContent = "←";
    back.addEventListener("click", () => {
      renderProjectList(card, allTasks, anchorBtn);
    });

    const title = document.createElement("h2");
    title.className = "punchly-reporter-card-title";
    title.textContent = projectName;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "punchly-reporter-card-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => {
      closeCard(card.closest("#punchly-reporter-backdrop"));
    });

    header.appendChild(back);
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "punchly-reporter-card-body";

    state.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "punchly-reporter-task-row";

      const nameEl = document.createElement("span");
      nameEl.className = "punchly-reporter-task-name";
      nameEl.textContent = item.task;

      const timeEl = document.createElement("span");
      timeEl.className = "punchly-reporter-task-time";
      timeEl.textContent = `[${item.time}]`;

      const wrap = document.createElement("div");
      wrap.className = "punchly-reporter-task-status";
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", `Status for ${item.task}`);
      const optDone = document.createElement("option");
      optDone.value = "completed";
      optDone.textContent = "✅ Completed";
      const optProg = document.createElement("option");
      optProg.value = "progress";
      optProg.textContent = "🟡 In Progress";
      optProg.selected = true;
      sel.appendChild(optDone);
      sel.appendChild(optProg);
      sel.addEventListener("change", () => {
        state[idx].status = sel.value;
      });
      wrap.appendChild(sel);

      row.appendChild(nameEl);
      row.appendChild(timeEl);
      row.appendChild(wrap);
      body.appendChild(row);
    });

    const copyWrap = document.createElement("div");
    copyWrap.className = "punchly-reporter-copy-wrap";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "punchly-reporter-copy-btn";
    copyBtn.textContent = "Copy";

    copyBtn.addEventListener("click", async () => {
      const totalSec = state.reduce((acc, s) => acc + s.seconds, 0);
      const totalLine = formatTotalHours(totalSec);

      chrome.storage.local.get(["userName"], async (result) => {
        let userName = result.userName;
        if (!userName || String(userName).trim() === "") {
          userName = "[Your Name]";
        }

        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const yyyy = String(now.getFullYear());
        const dateStr = `${dd}-${mm}-${yyyy}`;

        const completed = state.filter((s) => s.status === "completed");
        const inProg = state.filter((s) => s.status === "progress");

        let msg = "";
        msg += `Daily Work Report – ${dateStr}\r\n`;
        msg += `Name: ${userName}\r\n`;
        msg += `Project: ${projectName}\r\n`;
        msg += `\r\n`;

        if (completed.length > 0) {
          msg += `✅ Completed\r\n`;
          completed.forEach((s) => {
            msg += `- ${s.task} [${s.time}]\r\n`;
          });
          msg += `\r\n`;
        }

        if (inProg.length > 0) {
          msg += `🟡 In Progress\r\n`;
          inProg.forEach((s) => {
            msg += `- ${s.task} [${s.time}]\r\n`;
          });
          msg += `\r\n`;
        }

        msg += `Total Hours: ${totalLine}`;

        try {
          await navigator.clipboard.writeText(msg);
          closeCard(card.closest("#punchly-reporter-backdrop"));
        } catch {
          copyBtn.textContent = "Copy failed";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 2000);
        }
      });
    });

    copyWrap.appendChild(copyBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(copyWrap);

    requestAnimationFrame(() => positionCard(anchorBtn, card));
  }

  function openFloatingCard(anchorBtn, tasks) {
    const { card } = ensureCardHost();
    renderProjectList(card, tasks, anchorBtn);
    requestAnimationFrame(() => positionCard(anchorBtn, card));
  }
})();
