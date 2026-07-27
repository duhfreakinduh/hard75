(() => {
  "use strict";

  const STORAGE_KEY = "hard75-state-v1";
  const COACH_KEY = "hard75-coach-v2";
  const JOURNAL_KEY = "hard75-journal-v1";
  const DAY_MS = 86400000;
  const TIMER_SECONDS = 45 * 60;
  const plans = window.HARD75_PLANS;

  const defaultState = {
    settings: {
      name: "Joshua",
      startDate: localISODate(new Date()),
      waterGoal: 128,
      strict: true
    },
    days: {},
    restarts: 0
  };

  let state = loadState();
  const timerIntervals = { workout1: null, workout2: null };

  function $(id) { return document.getElementById(id); }

  function localISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { y, m, d };
  }

  function calendarStamp(value) {
    const parts = parseDateParts(value);
    return parts ? Date.UTC(parts.y, parts.m - 1, parts.d) : NaN;
  }

  function createTimer() {
    return { remaining: TIMER_SECONDS, endAt: null, running: false };
  }

  function createDay() {
    return {
      diet: false,
      workout1: false,
      workout2: false,
      water: 0,
      pages: 0,
      photo: false,
      faith: false,
      notes: "",
      won: false,
      gymLevel: "floor",
      outdoorLevel: "floor",
      workout1DoneAt: null,
      workout2DoneAt: null,
      timers: {
        workout1: createTimer(),
        workout2: createTimer()
      }
    };
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    for (const [key, value] of Object.entries(source)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        target[key] = deepMerge(target[key] || {}, value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }

  function normalizeDay(input) {
    const day = deepMerge(createDay(), input && typeof input === "object" ? input : {});
    day.water = Math.max(0, Math.min(256, Number(day.water) || 0));
    day.pages = Math.max(0, Math.min(200, Number(day.pages) || 0));
    day.gymLevel = day.gymLevel === "ceiling" ? "ceiling" : "floor";
    day.outdoorLevel = day.outdoorLevel === "ceiling" ? "ceiling" : "floor";
    for (const which of ["workout1", "workout2"]) {
      const timer = day.timers[which];
      timer.remaining = Math.max(0, Math.min(TIMER_SECONDS, Number(timer.remaining) || 0));
      timer.endAt = Number(timer.endAt) || null;
      timer.running = !!timer.running && !!timer.endAt && !day[which];
      if (day[which]) {
        timer.running = false;
        timer.endAt = null;
        timer.remaining = 0;
      }
    }
    return day;
  }

  function normalizeState(input) {
    const merged = deepMerge(structuredClone(defaultState), input && typeof input === "object" ? input : {});
    if (!parseDateParts(merged.settings.startDate)) merged.settings.startDate = localISODate(new Date());
    merged.settings.waterGoal = Math.max(1, Math.min(256, Number(merged.settings.waterGoal) || 128));
    merged.settings.strict = merged.settings.strict !== false;
    merged.settings.name = String(merged.settings.name || "Joshua").slice(0, 40);
    merged.restarts = Math.max(0, Number(merged.restarts) || 0);
    if (!merged.days || typeof merged.days !== "object" || Array.isArray(merged.days)) merged.days = {};
    for (const [key, value] of Object.entries(merged.days)) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > 75) delete merged.days[key];
      else merged.days[key] = normalizeDay(value);
    }
    return merged;
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeState(parsed || defaultState);
    } catch {
      return normalizeState(defaultState);
    }
  }

  function notify(reason) {
    queueMicrotask(() => window.dispatchEvent(new CustomEvent("hard75:state-change", { detail: { reason } })));
  }

  function saveState(reason = "update") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    notify(reason);
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function getCurrentDay() {
    const start = calendarStamp(state.settings.startDate);
    const today = calendarStamp(localISODate(new Date()));
    if (!Number.isFinite(start) || !Number.isFinite(today)) return 1;
    return Math.min(75, Math.max(1, Math.floor((today - start) / DAY_MS) + 1));
  }

  function getDay(dayNum = getCurrentDay()) {
    const key = String(dayNum);
    state.days[key] = normalizeDay(state.days[key]);
    return state.days[key];
  }

  function requiredDone(day) {
    return !!day.diet && !!day.workout1 && !!day.workout2 && day.water >= Number(state.settings.waterGoal) && day.pages >= 10 && !!day.photo;
  }

  function completionCount(day) {
    return [day.diet, day.workout1, day.workout2, day.water >= Number(state.settings.waterGoal), day.pages >= 10, day.photo].filter(Boolean).length;
  }

  function timerState(day, which) {
    if (!day.timers || typeof day.timers !== "object") day.timers = { workout1: createTimer(), workout2: createTimer() };
    if (!day.timers[which]) day.timers[which] = createTimer();
    return day.timers[which];
  }

  function liveRemaining(timer) {
    if (!timer.running || !timer.endAt) return Math.max(0, Number(timer.remaining) || 0);
    return Math.max(0, Math.ceil((Number(timer.endAt) - Date.now()) / 1000));
  }

  function stopTicker(which) {
    if (timerIntervals[which]) clearInterval(timerIntervals[which]);
    timerIntervals[which] = null;
  }

  function stopAllTickers() {
    stopTicker("workout1");
    stopTicker("workout2");
  }

  function completeWorkoutTimer(which) {
    const day = getDay();
    const timer = timerState(day, which);
    stopTicker(which);
    timer.running = false;
    timer.endAt = null;
    timer.remaining = 0;
    day[which] = true;
    day[`${which}DoneAt`] = day[`${which}DoneAt`] || Date.now();
    saveState(`${which}-timer-complete`);
    render();
  }

  function tickTimer(which) {
    const day = getDay();
    const timer = timerState(day, which);
    if (!timer.running) { stopTicker(which); renderTimerUI(which, day); return; }
    const remaining = liveRemaining(timer);
    if (remaining <= 0) { completeWorkoutTimer(which); return; }
    updateTimerDisplay(which, remaining);
  }

  function startTicker(which) {
    stopTicker(which);
    timerIntervals[which] = setInterval(() => tickTimer(which), 1000);
    tickTimer(which);
  }

  function renderTimerUI(which, day = getDay()) {
    const timer = timerState(day, which);
    const button = document.querySelector(`[data-timer="${which}"]`);
    const reset = document.querySelector(`[data-timer-reset="${which}"]`);
    if (!button) return;

    if (day[which]) {
      stopTicker(which);
      updateTimerDisplay(which, 0);
      button.textContent = "45 min complete ✓";
      button.disabled = true;
      if (reset) reset.disabled = true;
      return;
    }

    const remaining = liveRemaining(timer);
    updateTimerDisplay(which, remaining);
    button.disabled = false;
    if (reset) reset.disabled = false;
    button.textContent = timer.running ? "Pause timer" : remaining < TIMER_SECONDS ? "Resume timer" : "Start timer";
  }

  function renderTimers(day = getDay()) {
    renderTimerUI("workout1", day);
    renderTimerUI("workout2", day);
  }

  function restoreTimers() {
    for (const which of ["workout1", "workout2"]) {
      const day = getDay();
      const timer = timerState(day, which);
      if (day[which]) {
        renderTimerUI(which, day);
        continue;
      }
      if (timer.running && liveRemaining(timer) <= 0) {
        completeWorkoutTimer(which);
      } else if (timer.running) {
        startTicker(which);
      } else {
        renderTimerUI(which, day);
      }
    }
  }

  function toggleTimer(which) {
    const day = getDay();
    if (day[which]) return;
    const timer = timerState(day, which);

    if (timer.running) {
      timer.remaining = liveRemaining(timer);
      timer.running = false;
      timer.endAt = null;
      stopTicker(which);
      saveState(`${which}-timer-paused`);
      renderTimerUI(which, day);
      return;
    }

    if (timer.remaining <= 0) timer.remaining = TIMER_SECONDS;
    timer.running = true;
    timer.endAt = Date.now() + timer.remaining * 1000;
    saveState(`${which}-timer-started`);
    startTicker(which);
    renderTimerUI(which, day);
  }

  function resetTimer(which) {
    const day = getDay();
    if (day[which]) return;
    stopTicker(which);
    day.timers[which] = createTimer();
    saveState(`${which}-timer-reset`);
    renderTimerUI(which, day);
  }

  function updateTimerDisplay(which, seconds) {
    const el = which === "workout1" ? $("timer1") : $("timer2");
    if (!el) return;
    const value = Math.max(0, Number(seconds) || 0);
    const min = Math.floor(value / 60);
    const sec = value % 60;
    el.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function render() {
    const dayNum = getCurrentDay();
    const day = getDay(dayNum);

    $("todayLabel").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date()).toUpperCase();
    $("dayTitle").textContent = `Day ${dayNum} of 75`;

    const count = completionCount(day);
    const pct = Math.round((count / 6) * 100);
    $("progressPct").textContent = `${pct}%`;
    $("progressRing").style.setProperty("--pct", `${pct * 3.6}deg`);
    $("statusText").textContent = day.won ? "Today is won. Keep your word through bedtime." : count === 0 ? "Start with the floor. Build from there." : `${count} of 6 requirements complete.`;

    const wonDays = Object.values(state.days).filter(d => d?.won).length;
    $("statDay").textContent = dayNum;
    $("statWon").textContent = wonDays;
    $("statLeft").textContent = Math.max(0, 75 - wonDays);
    $("statRestarts").textContent = state.restarts || 0;

    renderPlans(dayNum, day);
    renderChecklist(day);
    renderFaith(dayNum, day);
    renderHistory(dayNum);
    renderStrictWarning(dayNum);
    renderTimers(day);

    if (document.activeElement !== $("notes")) $("notes").value = day.notes || "";
    const completeBtn = $("completeDayBtn");
    completeBtn.disabled = !!day.won || !requiredDone(day);
    completeBtn.textContent = day.won ? "✓ Today won" : requiredDone(day) ? "Mark today complete" : "Finish all requirements to win today";
  }

  function renderPlans(dayNum, day) {
    const idx = (dayNum - 1) % 7;
    const meal = plans.meals[idx];
    const workout = plans.workouts[idx];

    $("mealPlanDay").textContent = dayNum;
    $("mealPlanTitle").textContent = meal.title;
    $("mealPlanNote").textContent = meal.note;
    $("mealPlanList").innerHTML = meal.meals.map(([label, text]) => `<div class="plan-item"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(text)}</span></div>`).join("");
    $("mealPrepText").textContent = meal.prep;

    $("gymPlanTitle").textContent = workout.gymTitle;
    $("gymFocus").textContent = workout.focus;
    $("outdoorPlanTitle").textContent = workout.outdoorTitle;

    renderWorkoutList("gymPlanList", "gym", day.gymLevel, workout.ceiling, plans.floorRules.gym);
    renderWorkoutList("outdoorPlanList", "outdoor", day.outdoorLevel, workout.outdoorCeiling, plans.floorRules.outdoor);
  }

  function renderWorkoutList(containerId, kind, level, ceilingSteps, floor) {
    const isFloor = level === "floor";
    const steps = isFloor ? floor.steps : ceilingSteps;
    const title = isFloor ? floor.title : "CEILING • Full planned workout";
    const note = isFloor ? floor.note : "Do the full plan with controlled effort. Stop or substitute anything that causes sharp or unusual pain.";
    $(containerId).innerHTML = `
      <div class="level-switch" role="group" aria-label="Workout difficulty">
        <button type="button" class="level-btn ${isFloor ? "active" : ""}" data-level-kind="${kind}" data-level="floor" aria-pressed="${isFloor}">FLOOR</button>
        <button type="button" class="level-btn ${!isFloor ? "active" : ""}" data-level-kind="${kind}" data-level="ceiling" aria-pressed="${!isFloor}">CEILING</button>
      </div>
      <div class="level-summary ${isFloor ? "floor" : "ceiling"}">
        <strong>${escapeHTML(title)}</strong>
        <span>${escapeHTML(note)}</span>
      </div>
      ${steps.map(([label, text]) => `<div class="exercise-row"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(text)}</span></div>`).join("")}
    `;
  }

  function renderChecklist(day) {
    const map = {
      diet: day.diet,
      workout1: day.workout1,
      workout2: day.workout2,
      photo: day.photo,
      water: day.water >= Number(state.settings.waterGoal),
      reading: day.pages >= 10
    };
    Object.entries(map).forEach(([key, value]) => {
      const card = document.querySelector(`[data-task="${key}"]`);
      if (card) card.classList.toggle("done", !!value);
      const button = document.querySelector(`[data-check="${key}"]`);
      if (button) button.setAttribute("aria-pressed", String(!!value));
    });
    $("waterReadout").textContent = `${day.water} / ${state.settings.waterGoal} oz`;
    $("waterMeter").style.width = `${Math.min(100, (day.water / Number(state.settings.waterGoal)) * 100)}%`;
    $("pagesReadout").textContent = `${day.pages} / 10`;
  }

  function renderFaith(dayNum, day) {
    const faith = plans.faith[(dayNum - 1) % plans.faith.length];
    $("verseRef").textContent = faith[0];
    $("faithPrompt").textContent = faith[1];
    $("faithCheck").classList.toggle("done", day.faith);
    $("faithCheck").setAttribute("aria-pressed", String(!!day.faith));
    $("faithCheck").textContent = day.faith ? "Prayer + Scripture ✓" : "Prayer + Scripture ○";
  }

  function renderHistory(currentDay) {
    const grid = $("historyGrid");
    grid.innerHTML = "";
    for (let i = 1; i <= 75; i++) {
      const rec = state.days[String(i)];
      const btn = document.createElement("button");
      btn.className = "day-dot";
      btn.type = "button";
      btn.textContent = i;
      btn.dataset.historyDay = String(i);
      btn.title = `Day ${i}`;

      if (rec?.won) btn.classList.add("won");
      else if (rec && completionCount(rec) > 0) btn.classList.add("partial");
      if (i === currentDay) btn.classList.add("current");
      if (i > currentDay) {
        btn.classList.add("future");
        btn.disabled = true;
        btn.title = `Day ${i} — future day`;
        btn.setAttribute("aria-label", `Day ${i}, future day`);
      } else {
        btn.setAttribute("aria-label", `Open Day ${i} history`);
      }
      grid.appendChild(btn);
    }
  }

  function renderStrictWarning(currentDay) {
    let missed = false;
    if (state.settings.strict && currentDay > 1) {
      for (let i = 1; i < currentDay; i++) {
        const rec = state.days[String(i)];
        if (!rec?.won) { missed = true; break; }
      }
    }
    $("warningCard").classList.toggle("hidden", !missed);
  }

  function setWorkoutLevel(kind, level) {
    const day = getDay();
    if (kind === "gym") day.gymLevel = level;
    if (kind === "outdoor") day.outdoorLevel = level;
    saveState("workout-level");
    render();
  }

  function markRequirement(key) {
    const day = getDay();
    const next = !day[key];
    day[key] = next;

    if (key === "workout1" || key === "workout2") {
      const timer = timerState(day, key);
      stopTicker(key);
      if (next) {
        day[`${key}DoneAt`] = Date.now();
        timer.running = false;
        timer.endAt = null;
        timer.remaining = 0;
      } else {
        day[`${key}DoneAt`] = null;
        day.timers[key] = createTimer();
      }
    }

    saveState(`toggle-${key}`);
    render();
  }

  async function clearAuxForDay(startDate, dayNum) {
    const coach = readJSON(COACH_KEY, { days: {} });
    if (coach.days && typeof coach.days === "object") {
      delete coach.days[String(dayNum)];
      localStorage.setItem(COACH_KEY, JSON.stringify(coach));
    }

    const journal = readJSON(JOURNAL_KEY, { days: {} });
    const entryKey = `${startDate}:day:${dayNum}`;
    if (journal.days && typeof journal.days === "object") {
      delete journal.days[entryKey];
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    }

    try { await window.HARD75_PHOTOS?.remove(entryKey); } catch { /* main reset still succeeds */ }
  }

  async function restartChallenge() {
    if (!confirm("Restart HARD75 from Day 1 today? This clears the current attempt, journal entries, meal logs, timers, and saved progress photos from this device.")) return;
    stopAllTickers();
    state.days = {};
    state.restarts = (state.restarts || 0) + 1;
    state.settings.startDate = localISODate(new Date());
    localStorage.removeItem(COACH_KEY);
    localStorage.removeItem(JOURNAL_KEY);
    try { await window.HARD75_PHOTOS?.clear(); } catch { /* continue with state reset */ }
    saveState("restart");
    render();
    $("settingsDialog").close();
  }

  async function resetToday() {
    if (!confirm("Reset today? This clears today's checks, timer progress, water, pages, notes, feeling check-in, meal logs, and progress photo.")) return;
    const dayNum = getCurrentDay();
    const startDate = state.settings.startDate;
    stopAllTickers();
    state.days[String(dayNum)] = createDay();
    await clearAuxForDay(startDate, dayNum);
    saveState("reset-day");
    render();
  }

  async function exportBackup() {
    const button = $("exportBtn");
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Building backup…";
    try {
      const prefix = `${state.settings.startDate}:day:`;
      const photos = window.HARD75_PHOTOS ? await window.HARD75_PHOTOS.exportPrefix(prefix) : [];
      const backup = {
        format: "hard75-backup",
        version: 2,
        exportedAt: new Date().toISOString(),
        main: state,
        coach: readJSON(COACH_KEY, { days: {} }),
        journal: readJSON(JOURNAL_KEY, { days: {} }),
        photos
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hard75-backup-${localISODate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error(error);
      alert("I couldn't build the backup. Your existing app data was not changed.");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function importBackupFile(file) {
    let imported;
    try {
      imported = JSON.parse(await file.text());
    } catch {
      throw new Error("That backup file is not valid JSON.");
    }

    const isV2 = imported?.format === "hard75-backup" && imported?.version >= 2 && imported?.main;
    const nextMain = normalizeState(isV2 ? imported.main : imported);

    stopAllTickers();
    state = nextMain;

    if (isV2) {
      localStorage.setItem(COACH_KEY, JSON.stringify(imported.coach || { days: {} }));
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(imported.journal || { days: {} }));
      if (window.HARD75_PHOTOS) {
        await window.HARD75_PHOTOS.clear();
        await window.HARD75_PHOTOS.importEntries(imported.photos || []);
      }
    }

    saveState("import");
    render();
    restoreTimers();
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch]));
  }

  document.addEventListener("click", event => {
    const check = event.target.closest("[data-check]");
    if (check) { markRequirement(check.dataset.check); return; }

    const water = event.target.closest("[data-water]");
    if (water) {
      const day = getDay();
      day.water = Math.max(0, Math.min(256, day.water + Number(water.dataset.water)));
      saveState("water"); render(); return;
    }

    const pages = event.target.closest("[data-pages]");
    if (pages) {
      const day = getDay();
      day.pages = Math.max(0, Math.min(200, day.pages + Number(pages.dataset.pages)));
      saveState("pages"); render(); return;
    }

    const level = event.target.closest("[data-level]");
    if (level) { setWorkoutLevel(level.dataset.levelKind, level.dataset.level); return; }

    const timer = event.target.closest("[data-timer]");
    if (timer) { toggleTimer(timer.dataset.timer); return; }

    const timerReset = event.target.closest("[data-timer-reset]");
    if (timerReset) { resetTimer(timerReset.dataset.timerReset); return; }

    const jump = event.target.closest("[data-jump]");
    if (jump) {
      const target = jump.dataset.jump === "workout1" ? $("workout1Task") : $("workout2Task");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  $("faithCheck").addEventListener("click", () => {
    const day = getDay();
    day.faith = !day.faith;
    saveState("faith");
    render();
  });

  $("notes").addEventListener("input", event => {
    const day = getDay();
    day.notes = event.target.value;
    saveState("notes");
  });

  $("completeDayBtn").addEventListener("click", () => {
    const day = getDay();
    if (day.won || !requiredDone(day)) return;
    day.won = true;
    saveState("day-won");
    render();
  });

  $("resetTodayBtn").addEventListener("click", resetToday);

  $("settingsBtn").addEventListener("click", () => {
    $("nameInput").value = state.settings.name || "";
    $("startDateInput").value = state.settings.startDate;
    $("waterGoalInput").value = state.settings.waterGoal;
    $("strictInput").checked = !!state.settings.strict;
    if (!$("settingsDialog").open) $("settingsDialog").showModal();
  });

  $("settingsCloseBtn").addEventListener("click", () => $("settingsDialog").close());

  $("settingsForm").addEventListener("submit", event => {
    event.preventDefault();
    state.settings.name = $("nameInput").value.trim() || "Joshua";
    state.settings.startDate = parseDateParts($("startDateInput").value) ? $("startDateInput").value : localISODate(new Date());
    state.settings.waterGoal = Math.max(1, Math.min(256, Number($("waterGoalInput").value) || 128));
    state.settings.strict = $("strictInput").checked;
    stopAllTickers();
    saveState("settings");
    $("settingsDialog").close();
    render();
    restoreTimers();
  });

  $("restartBtn").addEventListener("click", restartChallenge);
  $("restartFromWarning").addEventListener("click", restartChallenge);
  $("exportBtn").addEventListener("click", exportBackup);

  $("importInput").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importBackupFile(file);
      alert("Backup restored.");
    } catch (error) {
      console.error(error);
      alert(error?.message || "That backup file could not be read.");
    }
    event.target.value = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restoreTimers();
  });

  window.addEventListener("pagehide", stopAllTickers);

  render();
  saveState("startup-normalize");
  restoreTimers();
})();
