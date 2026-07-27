(() => {
  "use strict";

  const MAIN_KEY = "hard75-state-v1";
  const COACH_KEY = "hard75-coach-v2";
  const GAP_MS = 3 * 60 * 60 * 1000;
  const PHOTO_DB = "hard75-photo-db";
  const PHOTO_STORE = "photos";

  let allowPhotoToggle = false;
  let lastWorkout1 = null;
  let lastWorkout2 = null;
  let currentPhotoUrl = null;
  let currentPhotoExists = false;

  const $ = id => document.getElementById(id);

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function mainState() { return readJSON(MAIN_KEY, null); }
  function coachState() { return readJSON(COACH_KEY, { days: {} }); }
  function saveCoach(value) { localStorage.setItem(COACH_KEY, JSON.stringify(value)); }

  function localISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDate(value) {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function currentDayNumber(main) {
    if (!main?.settings?.startDate) return 1;
    const start = parseDate(main.settings.startDate);
    const today = parseDate(localISODate(new Date()));
    return Math.min(75, Math.max(1, Math.floor((today - start) / 86400000) + 1));
  }

  function dayInfo() {
    const main = mainState();
    if (!main) return null;
    const dayNum = currentDayNumber(main);
    const day = main.days?.[String(dayNum)] || {};
    const coach = coachState();
    if (!coach.days[String(dayNum)]) {
      coach.days[String(dayNum)] = {
        meals: [false, false, false, false],
        workout1DoneAt: null,
        workout2DoneAt: null
      };
      saveCoach(coach);
    }
    return { main, dayNum, day, coach, cday: coach.days[String(dayNum)] };
  }

  function photoKey(main, dayNum) {
    return `${main.settings?.startDate || "start"}:day:${dayNum}`;
  }

  function openPhotoDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PHOTO_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function savePhoto(key, file) {
    const db = await openPhotoDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).put(file, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadPhoto(key) {
    const db = await openPhotoDB();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  }

  function injectCoach() {
    if ($("rightNowCard")) return;
    const hero = document.querySelector(".hero");
    if (!hero) return;

    const card = document.createElement("section");
    card.id = "rightNowCard";
    card.className = "right-now-card";
    card.setAttribute("aria-live", "polite");
    card.innerHTML = `
      <div class="right-now-top">
        <div class="right-now-kicker"><span class="right-now-dot"></span>WHAT DO I DO RIGHT NOW?</div>
        <div class="right-now-step" id="rightNowStep">NEXT</div>
      </div>
      <div class="right-now-content">
        <div class="right-now-icon" id="rightNowIcon">→</div>
        <div>
          <p class="right-now-label" id="rightNowLabel">NEXT ACTION</p>
          <h2 class="right-now-title" id="rightNowTitle">Loading your next move…</h2>
          <p class="right-now-copy" id="rightNowCopy"></p>
          <div class="right-now-meta" id="rightNowMeta"></div>
        </div>
      </div>
      <div id="rightNowInline" class="right-now-inline"></div>
      <button class="right-now-button" id="rightNowButton" type="button">DO THIS NOW →</button>
      <button class="right-now-subbutton" id="rightNowPlanButton" type="button">See full meals + workouts</button>
      <input id="coachCamera" type="file" accept="image/*" capture="user" hidden />
    `;
    hero.insertAdjacentElement("afterend", card);

    $("rightNowButton").addEventListener("click", runAction);
    $("rightNowPlanButton").addEventListener("click", () => {
      $("plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("coachCamera").addEventListener("change", onPhotoPicked);
  }

  function decoratePhotoTask() {
    const task = document.querySelector('[data-task="photo"]');
    if (!task || task.querySelector(".photo-tools")) return;
    const tools = document.createElement("div");
    tools.className = "photo-tools";
    tools.innerHTML = `
      <button type="button" class="small-btn" id="capturePhotoBtn">Take / add photo</button>
      <div id="photoPreviewWrap" class="photo-preview-wrap hidden"><img id="photoPreview" alt="Today's progress photo preview" /></div>
      <small class="photo-private">Saved only in this browser on this device.</small>
    `;
    task.querySelector(".task-copy")?.appendChild(tools);
    $("capturePhotoBtn")?.addEventListener("click", openCamera);
    refreshPhotoPreview();
  }

  async function refreshPhotoPreview() {
    const info = dayInfo();
    if (!info) return;
    try {
      const blob = await loadPhoto(photoKey(info.main, info.dayNum));
      currentPhotoExists = !!blob;
      const wrap = $("photoPreviewWrap");
      const img = $("photoPreview");
      if (!wrap || !img) return;
      if (currentPhotoUrl) URL.revokeObjectURL(currentPhotoUrl);
      if (blob) {
        currentPhotoUrl = URL.createObjectURL(blob);
        img.src = currentPhotoUrl;
        wrap.classList.remove("hidden");
      } else {
        img.removeAttribute("src");
        wrap.classList.add("hidden");
      }
      renderCoach();
    } catch {
      currentPhotoExists = false;
    }
  }

  function openCamera() {
    $("coachCamera")?.click();
  }

  async function onPhotoPicked(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const info = dayInfo();
    if (!info) return;
    try {
      await savePhoto(photoKey(info.main, info.dayNum), file);
      currentPhotoExists = true;
      const photoCheck = document.querySelector('[data-check="photo"]');
      if (photoCheck && !info.day.photo) {
        allowPhotoToggle = true;
        photoCheck.click();
        allowPhotoToggle = false;
      }
      await refreshPhotoPreview();
      flashCoach();
    } catch {
      alert("I couldn't save that photo on this device. Please try another photo.");
    }
    event.target.value = "";
  }

  function decorateMeals() {
    const info = dayInfo();
    const list = $("mealPlanList");
    if (!info || !list) return;
    const rows = [...list.querySelectorAll(".plan-item")];
    rows.forEach((row, index) => {
      let button = row.querySelector(".meal-check-btn");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "meal-check-btn";
        button.dataset.mealIndex = String(index);
        button.addEventListener("click", () => toggleMeal(index));
        row.appendChild(button);
      }
      const done = !!info.cday.meals[index];
      row.classList.toggle("meal-done", done);
      button.textContent = done ? "EATEN ✓" : "MARK EATEN";
    });
  }

  function toggleMeal(index) {
    const info = dayInfo();
    if (!info) return;
    info.cday.meals[index] = !info.cday.meals[index];
    saveCoach(info.coach);
    decorateMeals();
    renderCoach();
  }

  function observeMainApp() {
    const mealList = $("mealPlanList");
    if (mealList) new MutationObserver(() => setTimeout(decorateMeals, 0)).observe(mealList, { childList: true });

    document.addEventListener("click", event => {
      const photoCheck = event.target.closest('[data-check="photo"]');
      if (photoCheck && !allowPhotoToggle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCamera();
      }
    }, true);
  }

  function trackWorkoutTimes() {
    const info = dayInfo();
    if (!info) return;

    const w1 = !!info.day.workout1;
    const w2 = !!info.day.workout2;

    if (lastWorkout1 === false && w1 && !info.cday.workout1DoneAt) info.cday.workout1DoneAt = Date.now();
    if (lastWorkout2 === false && w2 && !info.cday.workout2DoneAt) info.cday.workout2DoneAt = Date.now();
    if (!w1) info.cday.workout1DoneAt = null;
    if (!w2) info.cday.workout2DoneAt = null;

    lastWorkout1 = w1;
    lastWorkout2 = w2;
    saveCoach(info.coach);
  }

  function firstDueMeal(info) {
    const hour = new Date().getHours();
    const thresholds = [0, 11, 15, 17];
    for (let i = 0; i < 4; i++) {
      if (!info.cday.meals[i] && hour >= thresholds[i]) return i;
    }
    return -1;
  }

  function allMealsDone(info) {
    return info.cday.meals.every(Boolean);
  }

  function timerRunning(id) {
    const value = $(id)?.textContent?.trim();
    return !!value && value !== "45:00" && value !== "00:00";
  }

  function formatGap(ms) {
    const mins = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function actionFor(info) {
    const { main, dayNum, day, cday } = info;
    const goal = Number(main.settings?.waterGoal || 128);
    const idx = (dayNum - 1) % 7;
    const mealPlan = window.HARD75_PLANS?.meals?.[idx];
    const workout = window.HARD75_PLANS?.workouts?.[idx];
    const dueMeal = firstDueMeal(info);

    if (day.won) return {
      type: "done", icon: "✓", label: "DAY WON", title: "You handled today.",
      copy: "Keep your word through bedtime. Tomorrow we do it again.",
      button: "TODAY IS COMPLETE ✓", buttonClass: "success",
      chips: [`Day ${dayNum} of 75`, "All requirements complete"]
    };

    if (!day.photo) return {
      type: "photo", icon: "📸", label: "DON'T FORGET THIS", title: "Take your progress photo.",
      copy: currentPhotoExists ? "A photo is saved. Tap below to confirm it for today." : "Tap once, use your camera, and the photo stays inside this browser on your device.",
      button: currentPhotoExists ? "CONFIRM TODAY'S PHOTO →" : "OPEN CAMERA →",
      chips: ["Saved in app", "About 30 seconds"]
    };

    if (dueMeal === 0) return mealAction(mealPlan, 0);

    if (!day.workout1) {
      if (timerRunning("timer1")) return {
        type: "workout1", icon: "⏱", label: "WORKOUT #1 RUNNING", title: `${$("timer1")?.textContent || ""} remaining`,
        copy: "Keep moving until the 45 minutes are complete.", button: "PAUSE / RESUME TIMER",
        chips: [String(day.gymLevel || "floor").toUpperCase(), workout?.gymTitle || "Main workout"]
      };
      return {
        type: "workout1", icon: "🏋", label: "WORKOUT #1", title: workout?.gymTitle || "Main workout",
        copy: day.gymLevel === "ceiling" ? "CEILING selected: use the full circuit shown in the app." : "FLOOR selected: 45 continuous minutes of purposeful walking.",
        button: "START 45:00 TIMER →",
        chips: [String(day.gymLevel || "floor").toUpperCase(), "45 continuous min"]
      };
    }

    if (Number(day.water || 0) < 32) return waterAction(day, goal);
    if (Number(day.pages || 0) < 10) return readingAction(day);
    if (!day.faith) return {
      type: "faith", icon: "✝", label: "GOD FIRST", title: "Prayer + Scripture.",
      copy: `${$("verseRef")?.textContent || "Today's verse"} — ${$("faithPrompt")?.textContent || ""}`,
      button: "MARK PRAYER + SCRIPTURE DONE →", chips: ["Faith habit", "Inside the app"]
    };

    if (dueMeal >= 1) return mealAction(mealPlan, dueMeal);

    if (!day.workout2) {
      const doneAt = Number(cday.workout1DoneAt || 0);
      const gapLeft = doneAt ? doneAt + GAP_MS - Date.now() : 0;
      if (gapLeft > 0) {
        if (Number(day.water || 0) < goal) {
          const action = waterAction(day, goal);
          action.label = "BETWEEN WORKOUTS";
          action.copy = `Workout #2 opens in about ${formatGap(gapLeft)}. Log some plain water while you wait.`;
          action.chips.push(`Outdoor in ${formatGap(gapLeft)}`);
          return action;
        }
        return {
          type: "wait", icon: "⌛", label: "RECOVERY WINDOW", title: `Outdoor workout in ${formatGap(gapLeft)}.`,
          copy: "You're caught up. Eat on plan, recover, and come back when the 3-hour separation is met.",
          button: "SHOW OUTDOOR PLAN →", buttonClass: "waiting", chips: ["Workout #1 done", "Stay on plan"]
        };
      }
      if (timerRunning("timer2")) return {
        type: "workout2", icon: "⏱", label: "OUTDOOR WORKOUT RUNNING", title: `${$("timer2")?.textContent || ""} remaining`,
        copy: "Stay outside and finish the continuous 45 minutes.", button: "PAUSE / RESUME TIMER",
        chips: [String(day.outdoorLevel || "floor").toUpperCase(), workout?.outdoorTitle || "Outdoor workout"]
      };
      return {
        type: "workout2", icon: "🚶", label: "WORKOUT #2 • OUTSIDE", title: workout?.outdoorTitle || "Outdoor workout",
        copy: day.outdoorLevel === "ceiling" ? "CEILING selected: follow the outdoor interval plan." : "FLOOR selected: purposeful 45-minute outdoor walk with family or pets.",
        button: "START OUTDOOR 45:00 →",
        chips: [String(day.outdoorLevel || "floor").toUpperCase(), "Outside • 45 min"]
      };
    }

    if (Number(day.water || 0) < goal) return waterAction(day, goal);

    const anyMeal = info.cday.meals.findIndex(done => !done);
    if (anyMeal >= 0) return mealAction(mealPlan, anyMeal);

    if (!day.diet) return {
      type: "diet", icon: "✓", label: "FINAL FOOD CHECK", title: "Did you stay on the plan all day?",
      copy: "No cheat meals. No alcohol. Only confirm this if you actually followed your chosen diet today.",
      button: "YES — I STAYED ON PLAN →", chips: ["All meals logged", "Be honest"]
    };

    if (day.workout1 && day.workout2 && day.photo && day.pages >= 10 && day.water >= goal && day.diet) return {
      type: "complete", icon: "🏁", label: "FINISH THE DAY", title: "Everything is checked.",
      copy: "One tap records today as won in your 75-day map.", button: "MARK TODAY COMPLETE →", buttonClass: "success",
      chips: ["6 / 6 complete", `Day ${dayNum}`]
    };

    return { type: "plan", icon: "→", label: "KEEP MOVING", title: "Check today's list.", copy: "Your next unfinished item is in the checklist below.", button: "GO TO CHECKLIST →", chips: [] };
  }

  function mealAction(plan, index) {
    const meal = plan?.meals?.[index] || ["Meal", "Eat according to today's plan"];
    return {
      type: "meal", mealIndex: index, icon: ["🍳", "🥗", "🍎", "🍽"][index] || "🍽",
      label: meal[0].toUpperCase(), title: meal[1],
      copy: "This is today's planned meal. Eat it, then mark it eaten right here.",
      button: `MARK ${meal[0].toUpperCase()} EATEN ✓`, chips: [plan?.title || "Meal plan", "Stay on plan"]
    };
  }

  function waterAction(day, goal) {
    return {
      type: "water", icon: "💧", label: "HYDRATE", title: "Drink some plain water.",
      copy: `You're at ${Number(day.water || 0)} of ${goal} oz. Tap the amount you actually drink.`,
      button: "LOG +16 OZ →", chips: [`${Number(day.water || 0)} / ${goal} oz`, "Plain water"]
    };
  }

  function readingAction(day) {
    const left = Math.max(0, 10 - Number(day.pages || 0));
    return {
      type: "reading", icon: "▤", label: "READ", title: `Read ${left} more page${left === 1 ? "" : "s"}.`,
      copy: "Non-fiction, personal-development reading. Log pages only after you actually read them.",
      button: "LOG +5 PAGES →", chips: [`${Number(day.pages || 0)} / 10 pages`, "No audiobook"]
    };
  }

  function renderInline(action) {
    const wrap = $("rightNowInline");
    if (!wrap) return;
    if (action.type === "water") {
      wrap.innerHTML = `<div class="coach-quick"><button data-coach-water="16">+16 oz</button><button data-coach-water="20">+20 oz</button><button data-coach-water="32">+32 oz</button></div>`;
    } else if (action.type === "reading") {
      wrap.innerHTML = `<div class="coach-quick"><button data-coach-pages="1">+1 page</button><button data-coach-pages="5">+5 pages</button></div>`;
    } else if (action.type === "workout1" || action.type === "workout2") {
      const kind = action.type === "workout1" ? "gym" : "outdoor";
      const info = dayInfo();
      const level = kind === "gym" ? info?.day.gymLevel : info?.day.outdoorLevel;
      wrap.innerHTML = `<div class="coach-quick"><button data-coach-level="${kind}:floor" class="${level === "floor" ? "selected" : ""}">FLOOR</button><button data-coach-level="${kind}:ceiling" class="${level === "ceiling" ? "selected" : ""}">CEILING</button><button data-coach-view="${action.type}">VIEW STEPS</button></div>`;
    } else if (action.type === "photo" && currentPhotoExists) {
      wrap.innerHTML = `<div class="coach-photo-note">Photo saved on this device. Tap the main button to confirm it for today, or use the photo card below to retake it.</div>`;
    } else {
      wrap.innerHTML = "";
    }
  }

  function renderCoach() {
    injectCoach();
    decoratePhotoTask();
    decorateMeals();
    trackWorkoutTimes();

    const info = dayInfo();
    if (!info || !$("rightNowCard")) return;
    const action = actionFor(info);
    $("rightNowCard").dataset.action = JSON.stringify({ type: action.type, mealIndex: action.mealIndex });
    $("rightNowIcon").textContent = action.icon;
    $("rightNowLabel").textContent = action.label;
    $("rightNowTitle").textContent = action.title;
    $("rightNowCopy").textContent = action.copy;
    $("rightNowStep").textContent = `DAY ${info.dayNum}`;
    $("rightNowMeta").innerHTML = (action.chips || []).map(chip => `<span class="right-now-chip">${escapeHTML(chip)}</span>`).join("");
    const button = $("rightNowButton");
    button.textContent = action.button;
    button.className = `right-now-button ${action.buttonClass || ""}`.trim();
    renderInline(action);
  }

  function runAction() {
    const card = $("rightNowCard");
    if (!card) return;
    let action;
    try { action = JSON.parse(card.dataset.action || "{}"); }
    catch { action = {}; }

    const info = dayInfo();
    if (!info) return;

    if (action.type === "photo") {
      if (currentPhotoExists && !info.day.photo) {
        const photoCheck = document.querySelector('[data-check="photo"]');
        if (photoCheck) {
          allowPhotoToggle = true;
          photoCheck.click();
          allowPhotoToggle = false;
        }
      } else openCamera();
    } else if (action.type === "meal") {
      toggleMeal(Number(action.mealIndex));
    } else if (action.type === "workout1") {
      document.querySelector('[data-timer="workout1"]')?.click();
    } else if (action.type === "workout2") {
      document.querySelector('[data-timer="workout2"]')?.click();
    } else if (action.type === "water") {
      document.querySelector('[data-water="16"]')?.click();
    } else if (action.type === "reading") {
      document.querySelector('[data-pages="5"]')?.click();
    } else if (action.type === "faith") {
      $("faithCheck")?.click();
    } else if (action.type === "wait") {
      document.querySelector(".outdoor-plan")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (action.type === "diet") {
      document.querySelector('[data-check="diet"]')?.click();
    } else if (action.type === "complete") {
      $("completeDayBtn")?.click();
    } else if (action.type === "plan") {
      $("today")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setTimeout(() => { renderCoach(); flashCoach(); }, 150);
  }

  function flashCoach() {
    const card = $("rightNowCard");
    if (!card) return;
    card.classList.remove("coach-flash");
    void card.offsetWidth;
    card.classList.add("coach-flash");
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  document.addEventListener("click", event => {
    const water = event.target.closest("[data-coach-water]");
    if (water) {
      document.querySelector(`[data-water="${water.dataset.coachWater}"]`)?.click();
      setTimeout(renderCoach, 100);
      return;
    }
    const pages = event.target.closest("[data-coach-pages]");
    if (pages) {
      document.querySelector(`[data-pages="${pages.dataset.coachPages}"]`)?.click();
      setTimeout(renderCoach, 100);
      return;
    }
    const level = event.target.closest("[data-coach-level]");
    if (level) {
      const [kind, value] = level.dataset.coachLevel.split(":");
      document.querySelector(`[data-level-kind="${kind}"][data-level="${value}"]`)?.click();
      setTimeout(renderCoach, 100);
      return;
    }
    const view = event.target.closest("[data-coach-view]");
    if (view) {
      const target = view.dataset.coachView === "workout1" ? $("workoutPlanCard") : document.querySelector(".outdoor-plan");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  function start() {
    injectCoach();
    observeMainApp();
    decoratePhotoTask();
    decorateMeals();
    const info = dayInfo();
    lastWorkout1 = !!info?.day.workout1;
    lastWorkout2 = !!info?.day.workout2;
    refreshPhotoPreview();
    renderCoach();
    setInterval(renderCoach, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
