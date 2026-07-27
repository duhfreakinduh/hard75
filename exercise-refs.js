(() => {
  "use strict";

  const wrap = (body, label) => `
    <div class="exercise-ref" aria-hidden="true">
      <svg viewBox="0 0 120 72" role="img">
        <line class="ref-muted" x1="60" y1="8" x2="60" y2="64"></line>
        ${body}
      </svg>
    </div>
    <small class="exercise-ref-label">${label}</small>`;

  const head = (cx, cy) => `<circle class="ref-head" cx="${cx}" cy="${cy}" r="5"></circle>`;
  const line = (x1,y1,x2,y2,cls="ref-line") => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
  const poly = (pts, cls="ref-line") => `<polyline class="${cls}" points="${pts}"></polyline>`;
  const arrow = () => `<path class="ref-arrow" d="M56 34 L64 29 L64 33 L70 33 L70 35 L64 35 L64 39 Z"></path>`;

  function standing(x, y=23) {
    return `${head(x,y)}${line(x,y+5,x,y+21)}${line(x,y+11,x-9,y+18)}${line(x,y+11,x+9,y+18)}${line(x,y+21,x-8,y+34)}${line(x,y+21,x+8,y+34)}`;
  }

  const refs = {
    walk: () => wrap(`${head(27,20)}${line(27,25,27,42)}${line(27,31,18,38)}${line(27,31,36,25)}${line(27,42,17,55)}${line(27,42,39,52)}${arrow()}${head(92,20)}${line(92,25,92,42)}${line(92,31,82,25)}${line(92,31,101,38)}${line(92,42,82,52)}${line(92,42,101,55)}`, "WALK"),
    squat: () => wrap(`${standing(27)}${arrow()}${head(92,27)}${line(92,32,88,45)}${line(88,45,76,45)}${line(88,45,100,52)}${line(88,38,77,34)}${line(88,38,99,35)}${line(100,52,106,62)}${line(76,45,72,58)}`, "SQUAT"),
    pushup: () => wrap(`${head(21,31)}${line(26,33,45,40)}${line(45,40,53,54)}${line(45,40,37,55)}${line(33,36,29,48)}${arrow()}${head(80,39)}${line(85,41,104,45)}${line(104,45,110,57)}${line(104,45,96,57)}${line(92,43,88,54)}`, "PUSH"),
    lunge: () => wrap(`${standing(27)}${arrow()}${head(90,22)}${line(90,27,89,43)}${line(89,43,78,53)}${line(78,53,68,53)}${line(89,43,101,46)}${line(101,46,108,58)}${line(89,33,80,38)}${line(89,33,98,37)}`, "LUNGE"),
    calf: () => wrap(`${standing(27)}${line(17,58,39,58,"ref-muted")}${arrow()}${head(92,18)}${line(92,23,92,40)}${line(92,29,84,35)}${line(92,29,100,35)}${line(92,40,85,53)}${line(92,40,99,53)}${line(84,58,101,58,"ref-muted")}${line(85,53,85,58)}${line(99,53,99,58)}`, "CALF"),
    knee: () => wrap(`${standing(27)}${arrow()}${head(92,20)}${line(92,25,92,41)}${line(92,31,83,37)}${line(92,31,101,25)}${line(92,41,84,55)}${line(92,41,101,45)}${line(101,45,101,35,"ref-accent")}`, "KNEE"),
    box: () => wrap(`${standing(27)}${line(27,33,39,29,"ref-accent")}${line(27,34,18,30,"ref-accent")}${arrow()}${standing(92)}${line(92,33,108,31,"ref-accent")}${line(92,34,83,29,"ref-accent")}`, "BOX"),
    deadbug: () => wrap(`${head(24,49)}${line(29,49,44,49)}${line(35,49,31,35)}${line(35,49,43,62)}${line(35,49,49,38)}${arrow()}${head(82,49)}${line(87,49,102,49)}${line(93,49,88,62)}${line(93,49,106,36)}${line(93,49,104,59)}${line(93,49,79,38)}`, "DEAD BUG"),
    birddog: () => wrap(`${head(23,34)}${line(28,36,43,40)}${line(34,38,29,52)}${line(43,40,48,53)}${line(43,40,53,32)}${arrow()}${head(81,34)}${line(86,36,99,40)}${line(91,38,83,53)}${line(99,40,109,52)}${line(99,40,111,34,"ref-accent")}`, "BIRD DOG"),
    bridge: () => wrap(`${head(24,52)}${line(29,52,45,52)}${line(45,52,54,60)}${line(39,52,47,39,"ref-accent")}${arrow()}${head(81,52)}${line(86,52,99,42,"ref-accent")}${line(99,42,109,57)}${line(86,52,94,57)}`, "BRIDGE"),
    jack: () => wrap(`${standing(27)}${arrow()}${head(92,18)}${line(92,23,92,40)}${line(92,29,79,18,"ref-accent")}${line(92,29,105,18,"ref-accent")}${line(92,40,80,55)}${line(92,40,104,55)}`, "STEP JACK"),
    hinge: () => wrap(`${standing(27)}${arrow()}${head(97,28)}${line(92,31,78,41,"ref-accent")}${line(78,41,77,54)}${line(78,41,88,55)}${line(83,38,73,34)}${line(83,38,91,43)}`, "HINGE"),
    crunch: () => wrap(`${standing(27)}${arrow()}${head(92,20)}${line(92,25,88,40)}${line(88,40,79,54)}${line(88,40,100,45)}${line(92,31,81,38,"ref-accent")}${line(92,31,101,24)}`, "CROSS"),
    reach: () => wrap(`${standing(27)}${arrow()}${head(92,26)}${line(92,31,87,45)}${line(87,45,76,47)}${line(87,45,100,52)}${line(88,36,78,23,"ref-accent")}${line(88,36,99,23,"ref-accent")}`, "REACH"),
    generic: () => wrap(`${standing(27)}${arrow()}${standing(92)}${line(82,17,102,17,"ref-accent")}`, "MOVE")
  };

  function pick(text) {
    const t = String(text || "").toLowerCase();
    if (/walk|treadmill|track|march|warm-up/.test(t)) return refs.walk();
    if (/squat|sit-to-stand/.test(t)) return refs.squat();
    if (/push-up|pushup|wall push/.test(t)) return refs.pushup();
    if (/lunge/.test(t)) return refs.lunge();
    if (/calf/.test(t)) return refs.calf();
    if (/knee drive|high-knee/.test(t)) return refs.knee();
    if (/boxing|shadow box/.test(t)) return refs.box();
    if (/dead bug/.test(t)) return refs.deadbug();
    if (/bird dog/.test(t)) return refs.birddog();
    if (/glute bridge|bridge/.test(t)) return refs.bridge();
    if (/step jack/.test(t)) return refs.jack();
    if (/good morning|hip hinge|hinge/.test(t)) return refs.hinge();
    if (/cross-crunch|cross crunch/.test(t)) return refs.crunch();
    if (/squat-to-reach|squat to reach/.test(t)) return refs.reach();
    return refs.generic();
  }

  window.HARD75_EXERCISE_REFS = { render: pick };
})();
