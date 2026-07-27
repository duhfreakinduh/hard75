(() => {
  "use strict";

  function addRefs(container) {
    if (!container || !window.HARD75_EXERCISE_REFS) return;
    [...container.querySelectorAll(".exercise-row")].forEach(row => {
      if (row.dataset.refReady === "1") return;
      const parts = [...row.children];
      const label = parts[0]?.textContent || "";
      const text = parts[1]?.textContent || "";
      const visual = document.createElement("div");
      visual.className = "exercise-ref-wrap";
      visual.innerHTML = window.HARD75_EXERCISE_REFS.render(`${label} ${text}`);
      row.insertBefore(visual, row.firstChild);
      row.classList.add("has-ref");
      row.dataset.refReady = "1";
    });
  }

  function refresh() {
    addRefs(document.getElementById("gymPlanList"));
    addRefs(document.getElementById("outdoorPlanList"));
  }

  function start() {
    const gym = document.getElementById("gymPlanList");
    const outdoor = document.getElementById("outdoorPlanList");
    if (gym) new MutationObserver(refresh).observe(gym, { childList: true, subtree: false });
    if (outdoor) new MutationObserver(refresh).observe(outdoor, { childList: true, subtree: false });
    refresh();
    setTimeout(refresh, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
