(() => {
  "use strict";

  const MAIN_KEY = "hard75-state-v1";
  const JOURNAL_KEY = "hard75-journal-v1";
  let historyPhotoUrl = null;

  const $ = id => document.getElementById(id);
  const photos = () => window.HARD75_PHOTOS;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function mainState() { return readJSON(MAIN_KEY, null); }
  function journalState() { return readJSON(JOURNAL_KEY, { days: {} }); }
  function saveJournal(value) { localStorage.setItem(JOURNAL_KEY, JSON.stringify(value)); }

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

  function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return new Date();
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function currentDayNumber(main) {
    if (!main?.settings?.startDate) return 1;
    const start = calendarStamp(main.settings.startDate);
    const today = calendarStamp(localISODate(new Date()));
    if (!Number.isFinite(start) || !Number.isFinite(today)) return 1;
    return Math.min(75, Math.max(1, Math.floor((today - start) / 86400000) + 1));
  }

  function dateForDay(main, dayNum) {
    const date = parseLocalDate(main.settings.startDate);
    date.setDate(date.getDate() + dayNum - 1);
    return date;
  }

  function formatDate(main, dayNum) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(dateForDay(main, dayNum));
  }

  function entryKey(main, dayNum) {
    return photos()?.key(main.settings?.startDate || "start", dayNum) || `${main.settings?.startDate || "start"}:day:${dayNum}`;
  }

  function getJournalEntry(main, dayNum) {
    const journal = journalState();
    const value = journal.days?.[entryKey(main, dayNum)];
    return value && typeof value === "object" ? { mood: "", feeling: "", ...value } : { mood: "", feeling: "" };
  }

  function updateJournalEntry(main, dayNum, patch) {
    const journal = journalState();
    if (!journal.days || typeof journal.days !== "object") journal.days = {};
    const key = entryKey(main, dayNum);
    journal.days[key] = { mood: "", feeling: "", ...(journal.days[key] || {}), ...patch };
    saveJournal(journal);
    return journal.days[key];
  }

  function completionCount(day, waterGoal) {
    return [
      !!day.diet,
      !!day.workout1,
      !!day.workout2,
      Number(day.water || 0) >= Number(waterGoal || 128),
      Number(day.pages || 0) >= 10,
      !!day.photo
    ].filter(Boolean).length;
  }

  function moodInfo(value) {
    return {
      rough: ["😣", "Rough"],
      low: ["😕", "Low"],
      okay: ["😐", "Okay"],
      good: ["🙂", "Good"],
      strong: ["🔥", "Strong"]
    }[value] || ["—", "Not logged"];
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch]));
  }

  function injectFeelingCard() {
    if ($("dailyFeelingCard")) return;
    const notes = document.querySelector(".notes.card");
    if (!notes) return;

    const card = document.createElement("section");
    card.id = "dailyFeelingCard";
    card.className = "card daily-feeling-card";
    card.innerHTML = `
      <div class="daily-feeling-head">
        <div>
          <p class="eyebrow">DAILY CHECK-IN</p>
          <h2>How are you feeling?</h2>
        </div>
        <span id="moodSavedLabel" class="mood-saved-label" aria-live="polite"></span>
      </div>
      <div class="daily-mood-row" role="group" aria-label="How are you feeling today?">
        <button type="button" class="daily-mood-btn" data-journal-mood="rough"><span>😣</span><small>Rough</small></button>
        <button type="button" class="daily-mood-btn" data-journal-mood="low"><span>😕</span><small>Low</small></button>
        <button type="button" class="daily-mood-btn" data-journal-mood="okay"><span>😐</span><small>Okay</small></button>
        <button type="button" class="daily-mood-btn" data-journal-mood="good"><span>🙂</span><small>Good</small></button>
        <button type="button" class="daily-mood-btn" data-journal-mood="strong"><span>🔥</span><small>Strong</small></button>
      </div>
      <textarea id="dailyFeelingText" rows="2" maxlength="240" placeholder="Quick note — energy, soreness, stress, confidence..."></textarea>
    `;
    notes.insertAdjacentElement("beforebegin", card);

    card.querySelectorAll("[data-journal-mood]").forEach(button => {
      button.addEventListener("click", () => {
        const main = mainState();
        if (!main) return;
        const dayNum = currentDayNumber(main);
        const current = getJournalEntry(main, dayNum);
        const nextMood = current.mood === button.dataset.journalMood ? "" : button.dataset.journalMood;
        updateJournalEntry(main, dayNum, { mood: nextMood });
        renderFeelingCard();
      });
    });

    $("dailyFeelingText").addEventListener("input", event => {
      const main = mainState();
      if (!main) return;
      updateJournalEntry(main, currentDayNumber(main), { feeling: event.target.value });
      $("moodSavedLabel").textContent = "Saved";
    });
  }

  function renderFeelingCard() {
    const main = mainState();
    if (!main || !$("dailyFeelingCard")) return;
    const dayNum = currentDayNumber(main);
    const entry = getJournalEntry(main, dayNum);

    document.querySelectorAll("[data-journal-mood]").forEach(button => {
      const active = button.dataset.journalMood === entry.mood;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const textarea = $("dailyFeelingText");
    if (textarea && document.activeElement !== textarea) textarea.value = entry.feeling || "";
    $("moodSavedLabel").textContent = entry.mood || entry.feeling ? "Saved" : "";
  }

  function injectMapHint() {
    const section = $("progress");
    const grid = $("historyGrid");
    if (!section || !grid || section.querySelector(".challenge-map-hint")) return;
    const hint = document.createElement("p");
    hint.className = "challenge-map-hint";
    hint.textContent = "Tap any current or past day to look back.";
    grid.insertAdjacentElement("beforebegin", hint);
  }

  function injectHistoryDialog() {
    if ($("dayHistoryDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "dayHistoryDialog";
    dialog.className = "day-history-dialog";
    dialog.innerHTML = `
      <div class="dialog-card day-history-card">
        <div class="dialog-head">
          <div>
            <p class="eyebrow">LOOK BACK</p>
            <h2 id="dayHistoryTitle">Day 1 of 75</h2>
            <p id="dayHistoryDate" class="day-history-date"></p>
          </div>
          <button id="dayHistoryClose" type="button" class="icon-btn" aria-label="Close day history">×</button>
        </div>
        <div id="dayHistoryResult" class="day-history-result"></div>
        <div id="dayHistoryPhotoWrap" class="day-history-photo-wrap hidden"><img id="dayHistoryPhoto" alt="Progress photo for this challenge day" /></div>
        <div id="dayHistoryNoPhoto" class="day-history-no-photo">No progress photo saved for this day.</div>
        <div id="dayHistoryMood" class="day-history-mood"></div>
        <div id="dayHistoryStats" class="day-history-stats"></div>
        <div id="dayHistoryChecklist" class="day-history-checklist"></div>
        <div class="day-history-copy"><strong>How I felt</strong><p id="dayHistoryFeeling">No feeling note saved.</p></div>
        <div class="day-history-copy"><strong>Daily notes</strong><p id="dayHistoryNotes">No notes saved.</p></div>
      </div>
    `;
    document.body.appendChild(dialog);

    $("dayHistoryClose").addEventListener("click", closeHistory);
    dialog.addEventListener("close", releaseHistoryPhoto);
    dialog.addEventListener("click", event => { if (event.target === dialog) closeHistory(); });
  }

  function historyCheck(label, done) {
    return `<div class="day-history-check ${done ? "done" : ""}"><span>${done ? "✓" : "○"}</span>${escapeHTML(label)}</div>`;
  }

  async function openHistory(dayNum) {
    const main = mainState();
    if (!main) return;
    const currentDay = currentDayNumber(main);
    if (dayNum > currentDay) return;

    const day = main.days?.[String(dayNum)] || {};
    const entry = getJournalEntry(main, dayNum);
    const waterGoal = Number(main.settings?.waterGoal || 128);
    const count = completionCount(day, waterGoal);
    const [moodIcon, moodLabel] = moodInfo(entry.mood);
    const hasJournal = !!entry.mood || !!entry.feeling?.trim() || !!day.notes?.trim();

    $("dayHistoryTitle").textContent = `Day ${dayNum} of 75`;
    $("dayHistoryDate").textContent = formatDate(main, dayNum);

    const result = $("dayHistoryResult");
    result.textContent = day.won ? "DAY WON ✓" : count ? `${count} OF 6 REQUIREMENTS` : hasJournal ? "JOURNAL ENTRY" : "NO ENTRY SAVED";
    result.classList.toggle("won", !!day.won);

    $("dayHistoryMood").innerHTML = `<span>${moodIcon}</span><div><small>HOW I FELT</small><strong>${escapeHTML(moodLabel)}</strong></div>`;
    $("dayHistoryStats").innerHTML = `
      <article><span>Water</span><strong>${Number(day.water || 0)} oz</strong></article>
      <article><span>Reading</span><strong>${Number(day.pages || 0)} pages</strong></article>
      <article><span>Gym</span><strong>${escapeHTML(String(day.gymLevel || "floor").toUpperCase())}</strong></article>
      <article><span>Outside</span><strong>${escapeHTML(String(day.outdoorLevel || "floor").toUpperCase())}</strong></article>
    `;
    $("dayHistoryChecklist").innerHTML = [
      historyCheck("Meal plan", !!day.diet),
      historyCheck("Workout #1", !!day.workout1),
      historyCheck("Workout #2 outside", !!day.workout2),
      historyCheck("Water goal", Number(day.water || 0) >= waterGoal),
      historyCheck("Read 10 pages", Number(day.pages || 0) >= 10),
      historyCheck("Progress photo", !!day.photo),
      historyCheck("Prayer + Scripture", !!day.faith)
    ].join("");
    $("dayHistoryFeeling").textContent = entry.feeling?.trim() || "No feeling note saved.";
    $("dayHistoryNotes").textContent = day.notes?.trim() || "No notes saved.";

    releaseHistoryPhoto();
    $("dayHistoryPhotoWrap").classList.add("hidden");
    $("dayHistoryPhoto").removeAttribute("src");
    $("dayHistoryNoPhoto").textContent = "No progress photo saved for this day.";
    $("dayHistoryNoPhoto").classList.remove("hidden");

    if (day.photo && photos()) {
      try {
        const blob = await photos().load(entryKey(main, dayNum));
        if (blob) {
          historyPhotoUrl = URL.createObjectURL(blob);
          $("dayHistoryPhoto").src = historyPhotoUrl;
          $("dayHistoryPhotoWrap").classList.remove("hidden");
          $("dayHistoryNoPhoto").classList.add("hidden");
        }
      } catch (error) {
        console.error(error);
        $("dayHistoryNoPhoto").textContent = "This photo could not be opened on this device.";
      }
    }

    const dialog = $("dayHistoryDialog");
    if (!dialog.open) dialog.showModal();
  }

  function releaseHistoryPhoto() {
    if (historyPhotoUrl) URL.revokeObjectURL(historyPhotoUrl);
    historyPhotoUrl = null;
  }

  function closeHistory() {
    releaseHistoryPhoto();
    const dialog = $("dayHistoryDialog");
    if (dialog?.open) dialog.close();
  }

  function watchMapClicks() {
    document.addEventListener("click", event => {
      const dayButton = event.target.closest("#historyGrid .day-dot[data-history-day]");
      if (!dayButton || dayButton.disabled) return;
      const dayNum = Number(dayButton.dataset.historyDay);
      if (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 75) openHistory(dayNum);
    });
  }

  function handleStateChange(event) {
    renderFeelingCard();
    const reason = event?.detail?.reason || "";
    if (["restart", "reset-day", "import", "settings"].includes(reason)) closeHistory();
  }

  function init() {
    injectFeelingCard();
    injectMapHint();
    injectHistoryDialog();
    watchMapClicks();
    renderFeelingCard();
    window.addEventListener("hard75:state-change", handleStateChange);
  }

  window.addEventListener("pagehide", releaseHistoryPhoto);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
