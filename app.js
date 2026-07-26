(() => {
  "use strict";

  const STORAGE_KEY = "hard75-state-v1";
  const DAY_MS = 86400000;
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
  let timers = { workout1: null, workout2: null };
  let timerSeconds = { workout1: 2700, workout2: 2700 };

  function $(id) { return document.getElementById(id); }
  function localISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function parseLocalDate(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed ? deepMerge(structuredClone(defaultState), parsed) : structuredClone(defaultState);
    } catch {
      return structuredClone(defaultState);
    }
  }
  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        target[key] = deepMerge(target[key] || {}, value);
      } else target[key] = value;
    }
    return target;
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function getCurrentDay() {
    const start = parseLocalDate(state.settings.startDate);
    const today = parseLocalDate(localISODate(new Date()));
    return Math.min(75, Math.max(1, Math.floor((today - start) / DAY_MS) + 1));
  }

  function getDay(dayNum = getCurrentDay()) {
    const key = String(dayNum);
    if (!state.days[key]) {
      state.days[key] = {
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
        outdoorLevel: "floor"
      };
    }
    return state.days[key];
  }

  function requiredDone(day) {
    return !!day.diet && !!day.workout1 && !!day.workout2 && day.water >= Number(state.settings.waterGoal) && day.pages >= 10 && !!day.photo;
  }

  function completionCount(day) {
    return [day.diet, day.workout1, day.workout2, day.water >= Number(state.settings.waterGoal), day.pages >= 10, day.photo].filter(Boolean).length;
  }

  function render() {
    const dayNum = getCurrentDay();
    const day = getDay(dayNum);
    saveState();

    $("todayLabel").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date()).toUpperCase();
    $("dayTitle").textContent = `Day ${dayNum} of 75`;

    const count = completionCount(day);
    const pct = Math.round((count / 6) * 100);
    $("progressPct").textContent = `${pct}%`;
    $("progressRing").style.setProperty("--pct", `${pct * 3.6}deg`);
    $("statusText").textContent = day.won ? "Today is won. Keep your word through bedtime." : count === 0 ? "Start with the floor. Build from there." : `${count} of 6 requirements complete.`;

    const wonDays = Object.values(state.days).filter(d => d.won).length;
    $("statDay").textContent = dayNum;
    $("statWon").textContent = wonDays;
    $("statLeft").textContent = Math.max(0, 75 - wonDays);
    $("statRestarts").textContent = state.restarts || 0;

    renderPlans(dayNum, day);
    renderChecklist(day);
    renderFaith(dayNum, day);
    renderHistory(dayNum);
    renderStrictWarning(dayNum);

    $("notes").value = day.notes || "";
    const completeBtn = $("completeDayBtn");
    completeBtn.disabled = !requiredDone(day);
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
        <button type="button" class="level-btn ${isFloor ? "active" : ""}" data-level-kind="${kind}" data-level="floor">FLOOR</button>
        <button type="button" class="level-btn ${!isFloor ? "active" : ""}" data-level-kind="${kind}" data-level="ceiling">CEILING</button>
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
      btn.title = `Day ${i}`;
      if (rec?.won) btn.classList.add("won");
      else if (i === currentDay) btn.classList.add("current");
      else if (rec && completionCount(rec) > 0) btn.classList.add("partial");
      else if (i > currentDay) btn.classList.add("future");
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

  function restartChallenge() {
    if (!confirm("Restart HARD75 from Day 1 today? Your previous attempt will be cleared from this device.")) return;
    state.days = {};
    state.restarts = (state.restarts || 0) + 1;
    state.settings.startDate = localISODate(new Date());
    saveState();
    render();
    $("settingsDialog").close();
  }

  function setWorkoutLevel(kind, level) {
    const day = getDay();
    if (kind === "gym") day.gymLevel = level;
    if (kind === "outdoor") day.outdoorLevel = level;
    saveState();
    render();
  }

  function toggleTimer(which, button) {
    if (timers[which]) {
      clearInterval(timers[which]);
      timers[which] = null;
      button.textContent = "Resume timer";
      return;
    }
    button.textContent = "Pause timer";
    timers[which] = setInterval(() => {
      timerSeconds[which] = Math.max(0, timerSeconds[which] - 1);
      updateTimerDisplay(which);
      if (timerSeconds[which] === 0) {
        clearInterval(timers[which]);
        timers[which] = null;
        const day = getDay();
        day[which] = true;
        saveState();
        button.textContent = "45 min complete ✓";
        render();
      }
    }, 1000);
  }

  function resetTimer(which) {
    if (timers[which]) clearInterval(timers[which]);
    timers[which] = null;
    timerSeconds[which] = 2700;
    updateTimerDisplay(which);
    const btn = document.querySelector(`[data-timer="${which}"]`);
    if (btn) btn.textContent = "Start timer";
  }

  function updateTimerDisplay(which) {
    const el = which === "workout1" ? $("timer1") : $("timer2");
    const min = Math.floor(timerSeconds[which] / 60);
    const sec = timerSeconds[which] % 60;
    el.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  }

  document.addEventListener("click", (event) => {
    const check = event.target.closest("[data-check]");
    if (check) {
      const key = check.dataset.check;
      const day = getDay();
      day[key] = !day[key];
      saveState();
      render();
      return;
    }

    const water = event.target.closest("[data-water]");
    if (water) {
      const day = getDay();
      day.water = Math.max(0, Math.min(256, day.water + Number(water.dataset.water)));
      saveState(); render(); return;
    }

    const pages = event.target.closest("[data-pages]");
    if (pages) {
      const day = getDay();
      day.pages = Math.max(0, Math.min(200, day.pages + Number(pages.dataset.pages)));
      saveState(); render(); return;
    }

    const level = event.target.closest("[data-level]");
    if (level) { setWorkoutLevel(level.dataset.levelKind, level.dataset.level); return; }

    const timer = event.target.closest("[data-timer]");
    if (timer) { toggleTimer(timer.dataset.timer, timer); return; }

    const timerReset = event.target.closest("[data-timer-reset]");
    if (timerReset) { resetTimer(timerReset.dataset.timerReset); return; }

    const jump = event.target.closest("[data-jump]");
    if (jump) {
      const target = jump.dataset.jump === "workout1" ? $("workout1Task") : $("workout2Task");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  $("faithCheck").addEventListener("click", () => { const d = getDay(); d.faith = !d.faith; saveState(); render(); });
  $("notes").addEventListener("input", e => { const d = getDay(); d.notes = e.target.value; saveState(); });
  $("completeDayBtn").addEventListener("click", () => {
    const d = getDay();
    if (!requiredDone(d)) return;
    d.won = true;
    saveState(); render();
  });
  $("resetTodayBtn").addEventListener("click", () => {
    if (!confirm("Reset today's checkboxes, water, pages, and notes?")) return;
    state.days[String(getCurrentDay())] = { diet:false, workout1:false, workout2:false, water:0, pages:0, photo:false, faith:false, notes:"", won:false, gymLevel:"floor", outdoorLevel:"floor" };
    saveState(); render();
  });

  $("settingsBtn").addEventListener("click", () => {
    $("nameInput").value = state.settings.name || "";
    $("startDateInput").value = state.settings.startDate;
    $("waterGoalInput").value = state.settings.waterGoal;
    $("strictInput").checked = !!state.settings.strict;
    $("settingsDialog").showModal();
  });
  $("settingsForm").addEventListener("submit", e => {
    e.preventDefault();
    state.settings.name = $("nameInput").value.trim() || "Joshua";
    state.settings.startDate = $("startDateInput").value || localISODate(new Date());
    state.settings.waterGoal = Math.max(1, Math.min(256, Number($("waterGoalInput").value) || 128));
    state.settings.strict = $("strictInput").checked;
    saveState();
    $("settingsDialog").close();
    render();
  });
  $("restartBtn").addEventListener("click", restartChallenge);
  $("restartFromWarning").addEventListener("click", restartChallenge);

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hard75-backup-${localISODate(new Date())}.json`; a.click();
    URL.revokeObjectURL(url);
  });
  $("importInput").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = deepMerge(structuredClone(defaultState), imported);
      saveState(); render();
      alert("Backup restored.");
    } catch { alert("That backup file could not be read."); }
    e.target.value = "";
  });

  render();
})();
