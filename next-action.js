(() => {
  "use strict";

  const MAIN_KEY = "hard75-state-v1";
  const COACH_KEY = "hard75-coach-v2";
  const GAP_MS = 3 * 60 * 60 * 1000;
  const COACH_REFRESH_MS = 5000;

  let allowPhotoToggle = false;
  let currentPhotoUrl = null;
  let currentPhotoExists = false;
  let periodicRefresh = null;

  const $ = id => document.getElementById(id);
  const photos = () => window.HARD75_PHOTOS;

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

  function calendarStamp(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return NaN;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function currentDayNumber(main) {
    if (!main?.settings?.startDate) return 1;
    const start = calendarStamp(main.settings.startDate);
    const today = calendarStamp(localISODate(new Date()));
    if (!Number.isFinite(start) || !Number.isFinite(today)) return 1;
    return Math.min(75, Math.max(1, Math.floor((today - start) / 86400000) + 1));
  }

  function dayInfo() {
    const main = mainState();
    if (!main) return null;
    const dayNum = currentDayNumber(main);
    const day = main.days?.[String(dayNum)] || {};
    const coach = coachState();
    if (!coach.days || typeof coach.days !== "object") coach.days = {};
    if (!coach.days[String(dayNum)]) {
      coach.days[String(dayNum)] = { meals: [false, false, false, false] };
      saveCoach(coach);
    }
    const cday = coach.days[String(dayNum)];
    if (!Array.isArray(cday.meals)) cday.meals = [false, false, false, false];
    while (cday.meals.length < 4) cday.meals.push(false);
    return { main, dayNum, day, coach, cday };
  }

  function photoKey(main, dayNum) {
    return photos()?.key(main.settings?.startDate || "start", dayNum) || `${main.settings?.startDate || "start"}:day:${dayNum}`;
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
      <button type="button" class="small-btn" id="capturePhotoBtn">Take / retake photo</button>
      <div id="photoPreviewWrap" class="photo-preview-wrap hidden"><img id="photoPreview" alt="Today's progress photo preview" /></div>
      <small class="photo-private">Saved in this app on this device and included in exported backups.</small>
    `;
    task.querySelector(".task-copy")?.appendChild(tools);
    $("capturePhotoBtn")?.addEventListener("click", openCamera);
  }

  function releaseCurrentPhotoUrl() {
    if (currentPhotoUrl) URL.revokeObjectURL(currentPhotoUrl);
    currentPhotoUrl = null;
  }

  async function refreshPhotoPreview() {
    const info = dayInfo();
    if (!info) return;
    const store = photos();
    const wrap = $("photoPreviewWrap");
    const img = $("photoPreview");
    if (!wrap || !img || !store) return;

    try {
      const blob = await store.load(photoKey(info.main, info.dayNum));
      currentPhotoExists = !!blob;
      releaseCurrentPhotoUrl();
      if (blob) {
        currentPhotoUrl = URL.createObjectURL(blob);
        img.src = currentPhotoUrl;
        wrap.classList.remove("hidden");
      } else {
        img.removeAttribute("src");
        wrap.classList.add("hidden");
      }
      renderCoach();
    } catch (error) {
      console.error(error);
      currentPhotoExists = false;
      img.removeAttribute("src");
      wrap.classList.add("hidden");
    }
  }

  function openCamera() {
    if (!photos()) {
      alert("Photo storage isn't available in this browser.");
      return;
    }
    $("coachCamera")?.click();
  }

  async function onPhotoPicked(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const info = dayInfo();
    const store = photos();
    if (!info || !store) return;

    try {
      const optimized = await store.optimizeImage(file);
      await store.save(photoKey(info.main, info.dayNum), optimized);
      currentPhotoExists = true;
      const photoCheck = document.querySelector('[data-check="photo"]');
      if (photoCheck && !info.day.photo) {
        allowPhotoToggle = true;
        photoCheck.click();
        allowPhotoToggle = false;
      }
      await refreshPhotoPreview();
      flashCoach();
    } catch (error) {
      console.error(error);
      alert("I couldn't save that photo on this device. Please try another photo.");
    } finally {
      event.target.value = "";
    }
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
      button.setAttribute("aria-pressed", String(done));
      button.textContent = done ? "EATEN ✓" : "MARK EATEN";
    });
  }

  function toggleMeal(index) {
    const info = dayInfo();
    if (!info || !Number.isInteger(index) || index < 0 || index > 3) return;
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
      if (!photoCheck || allowPhotoToggle) return;
      const info = dayInfo();
      if (info?.day.photo) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openCamera();
    }, true);
  }

  function firstDueMeal(info) {
    const hour = new Date().getHours();
    const thresholds = [0, 11, 15, 17];
    for (let i = 0; i < 4; i++) {
      if (!info.cday.meals[i] && hour >= thresholds[i]) return i;
    }
    return -1;
  }

  function timerRunning(day, which) {
    return !!day?.timers?.[which]?.running && !day?.[which];
  }

  function formatGap(ms) {
    const mins = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function actionFor(info) {
    const { main, dayNum, day } = info;
    const goal = Number(main.settings?.waterGoal || 128);
    const idx = (dayNum - 1) % 7;
    const mealPlan = window.HARD75_PLANS?.meals?.[idx];
    const workout = window.HARD75_PLANS?.workouts?.[idx];
    const dueMeal = firstDueMeal(info);

    if (day.won) return {
      type: "done", icon: "✓", label: "DAY WON", title: "You handled today.",
      copy: "Keep your word through bedtime. Tap below to see today's record in your challenge map.",
      button: "VIEW TODAY IN CHALLENGE MAP →", buttonClass: "success",
      chips: [`Day ${dayNum} of 75`, "All requirements complete"]
    };

    if (!day.photo) return {
      type: "photo", icon: "📸", label: "DON'T FORGET THIS", title: "Take your progress photo.",
      copy: currentPhotoExists ? "A photo is saved. Tap below to confirm it for today." : "Tap once, use your camera, and the photo stays inside this app on your device.",
      button: currentPhotoExists ? "CONFIRM TODAY'S PHOTO →" : "OPEN CAMERA →",
      chips: ["Saved in app", "Included in backup"]
    };

    if (dueMeal === 0) return mealAction(mealPlan, 0);

    if (!day.workout1) {
      if (timerRunning(day, "workout1")) return {
        type: "workout1", icon: "⏱", label: "WORKOUT #1 RUNNING", title: `${$("timer1")?.textContent || ""} remaining`,
        copy: "Keep moving until the 45 minutes are complete. The timer stays accurate if your phone sleeps.", button: "PAUSE / RESUME TIMER",
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
      const doneAt = Number(day.workout1DoneAt || 0);
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
      if (timerRunning(day, "workout2")) return {
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
    } else if (action.type === "done") {
      $("progress")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => document.querySelector("#historyGrid .day-dot.current")?.click(), 180);
    } else {
      $("today")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setTimeout(() => { renderCoach(); flashCoach(); }, 120);
  }

  function flashCoach() {
    const card = $("rightNowCard");
    if (!card) return;
    card.classList.remove("coach-flash");
    void card.offsetWidth;
    card.classList.add("coach-flash");
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }

  document.addEventListener("click", event => {
    const water = event.target.closest("[data-coach-water]");
    if (water) {
      document.querySelector(`[data-water="${water.dataset.coachWater}"]`)?.click();
      return;
    }

    const pages = event.target.closest("[data-coach-pages]");
    if (pages) {
      document.querySelector(`[data-pages="${pages.dataset.coachPages}"]`)?.click();
      return;
    }

    const level = event.target.closest("[data-coach-level]");
    if (level) {
      const [kind, value] = level.dataset.coachLevel.split(":");
      document.querySelector(`[data-level-kind="${kind}"][data-level="${value}"]`)?.click();
      return;
    }

    const view = event.target.closest("[data-coach-view]");
    if (view) {
      const target = view.dataset.coachView === "workout1" ? $("workouts") : document.querySelector(".outdoor-plan");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  function handleStateChange(event) {
    renderCoach();
    const reason = event?.detail?.reason || "";
    if (["reset-day", "restart", "import", "settings"].includes(reason)) refreshPhotoPreview();
  }

  function start() {
    injectCoach();
    observeMainApp();
    decoratePhotoTask();
    decorateMeals();
    refreshPhotoPreview();
    renderCoach();
    window.addEventListener("hard75:state-change", handleStateChange);
    periodicRefresh = setInterval(renderCoach, COACH_REFRESH_MS);
  }

  window.addEventListener("pagehide", () => {
    if (periodicRefresh) clearInterval(periodicRefresh);
    releaseCurrentPhotoUrl();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
