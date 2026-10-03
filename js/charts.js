// The two 7-day charts: temperature (high/low bars) and chance of rain.
// They always scroll together and always come to rest on whole days.
// Ways to move: drag with the mouse or a finger, the big arrow buttons, a trackpad swipe, or arrow keys.
window.Weather = window.Weather || {};

Weather.charts = (function () {
  const DRAG_START_PX = 10;     // a press that moves less than this is a click (and reads the day), not a drag
  const MIN_DAY_WIDTH_REM = 8.5; // when days would be narrower than this, fewer are shown at once
  const MAX_VISIBLE = 3;
  const TEMP_PLOT_REM = 7;      // height from the week's highest high to its lowest low
  const RAIN_PLOT_REM = 5.5;    // height of a 100% rain bar
  const MIN_BAR_REM = 0.75;     // a day with almost no high/low difference still gets a visible bar
  const ANIM_MS = 280;
  const WHEEL_STEP = 40;        // horizontal wheel/trackpad distance that moves one day
  const WHEEL_GESTURE_GAP_MS = 250;

  const words = Weather.words;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function create({ tempTrack, rainTrack, rangeButtons, prevButtons, nextButtons }) {
    const tracks = [tempTrack, rainTrack];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let days = [];
    let labels = [];
    let offset = 0;          // index of the first visible day; fractional while dragging or animating
    let visible = MAX_VISIBLE;
    let frame = 0;
    let drag = null;
    let suppressClick = false;
    let wheel = { sum: 0, last: 0, used: false };

    rainTrack.style.setProperty('--rain-plot', RAIN_PLOT_REM + 'rem');

    const maxOffset = () => Math.max(0, days.length - visible);
    const dayWidth = () => tempTrack.clientWidth / visible;

    function readable(node, say) {
      node.dataset.say = say;
      node.setAttribute('aria-label', say);
    }

    function tempDay(day, i, top, range) {
      const b = el('button', 'day temp-day readable');
      b.type = 'button';
      b.dataset.index = i;
      readable(b, words.tempDay(day, labels[i]));
      const gap = el('span', 'temp-gap');
      gap.style.height = ((top - day.high) / range * TEMP_PLOT_REM).toFixed(2) + 'rem';
      const bar = el('span', 'temp-bar');
      bar.style.height = Math.max(MIN_BAR_REM, (day.high - day.low) / range * TEMP_PLOT_REM).toFixed(2) + 'rem';
      b.append(el('span', 'day-name', labels[i]), gap, el('span', 'temp-num', words.temp(day.high)), bar,
        el('span', 'temp-num', words.temp(day.low)));
      return b;
    }

    function rainDay(day, i) {
      const b = el('button', 'day rain-day readable');
      b.type = 'button';
      b.dataset.index = i;
      readable(b, words.rainDay(day, labels[i]));
      const plot = el('span', 'rain-plot');
      const bar = el('span', 'rain-bar');
      bar.style.height = (day.rain / 100 * RAIN_PLOT_REM).toFixed(2) + 'rem';
      plot.append(el('span', 'rain-num', day.rain + '%'), bar);
      b.append(plot, el('span', 'rain-base'), el('span', 'day-name', labels[i]));
      return b;
    }

    function render(newDays, newLabels) {
      days = newDays;
      labels = newLabels;
      // One shared scale for the whole week, so a warmer day sits visibly higher.
      const top = Math.max(...days.map(d => d.high));
      const range = Math.max(1, top - Math.min(...days.map(d => d.low)));
      tempTrack.replaceChildren(...days.map((d, i) => tempDay(d, i, top, range)));
      rainTrack.replaceChildren(...days.map((d, i) => rainDay(d, i)));
      tracks.forEach(t => setTabStop(t, 0));
      stopAnimation();
      offset = 0;
      layout();
    }

    // Works out how many days fit, then puts both charts back on a whole day.
    function layout() {
      const width = tempTrack.clientWidth;
      if (!width) return; // hidden (another screen is showing); runs again when shown
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fit = Math.floor(width / (MIN_DAY_WIDTH_REM * remPx));
      visible = clamp(fit, 1, Math.min(MAX_VISIBLE, days.length || MAX_VISIBLE));
      tracks.forEach(t => t.style.setProperty('--visible', visible));
      stopAnimation();
      offset = clamp(Math.round(offset), 0, maxOffset());
      applyScroll();
      updateControls();
    }

    function applyScroll() {
      const x = offset * dayWidth();
      tracks.forEach(t => { t.scrollLeft = x; });
    }

    function updateControls() {
      const first = Math.round(offset);
      const last = Math.min(days.length, first + visible) - 1;
      const text = first === last ? `Day ${first + 1} of ${days.length}` : `Days ${first + 1}–${last + 1} of ${days.length}`;
      const say = words.range(labels.slice(first, last + 1), days.length);
      rangeButtons.forEach(b => {
        b.textContent = text;
        readable(b, say);
      });
      prevButtons.forEach(b => b.setAttribute('aria-disabled', String(first <= 0)));
      nextButtons.forEach(b => b.setAttribute('aria-disabled', String(first >= maxOffset())));
      // Keep each chart's single Tab stop on a day that is on screen.
      tracks.forEach(t => {
        const stop = [...t.children].findIndex(c => c.tabIndex === 0);
        if (stop < first || stop > last) setTabStop(t, first);
      });
    }

    function setTabStop(track, index) {
      [...track.children].forEach((c, i) => { c.tabIndex = i === index ? 0 : -1; });
    }

    function stopAnimation() {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function goTo(target, animate = true) {
      target = clamp(Math.round(target), 0, maxOffset());
      stopAnimation();
      if (!animate || reduceMotion.matches || Math.abs(target - offset) < 0.001) {
        offset = target;
        applyScroll();
        updateControls();
        return;
      }
      const from = offset;
      const start = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - start) / ANIM_MS);
        offset = from + (target - from) * (1 - Math.pow(1 - t, 3));
        applyScroll();
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          frame = 0;
          offset = target;
          updateControls();
        }
      };
      frame = requestAnimationFrame(tick);
    }

    const step = dir => goTo(Math.round(offset) + dir);

    function ensureVisible(index) {
      const first = Math.round(offset);
      if (index < first) goTo(index);
      else if (index > first + visible - 1) goTo(index - visible + 1);
    }

    // --- Dragging (mouse and touch) ---------------------------------------------------------------

    function onPointerDown(e) {
      if (e.button !== 0 || drag) return;
      stopAnimation();
      drag = { id: e.pointerId, track: e.currentTarget, x0: e.clientX, offset0: offset, moved: false };
    }

    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_START_PX) return;
        drag.moved = true;
        try { drag.track.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
        tracks.forEach(t => t.classList.add('dragging'));
      }
      offset = clamp(drag.offset0 - dx / dayWidth(), 0, maxOffset());
      applyScroll();
    }

    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      tracks.forEach(t => t.classList.remove('dragging'));
      if (!d.moved) return; // a plain click: the day's own click handler reads it
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      // Any deliberate drag moves at least one day; longer drags move as many days as were dragged.
      const dragged = (d.x0 - e.clientX) / dayWidth();
      const target = Math.abs(dragged) < 0.2
        ? d.offset0
        : d.offset0 + Math.sign(dragged) * Math.max(1, Math.round(Math.abs(dragged)));
      goTo(target);
    }

    function onPointerCancel(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      tracks.forEach(t => t.classList.remove('dragging'));
      goTo(offset);
    }

    // A drag must not also count as a click on the day under the pointer.
    function onClickCapture(e) {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
    }

    // --- Trackpad and shift+wheel: one swipe moves one day ------------------------------------------

    function onWheel(e) {
      let dx = e.deltaX;
      if (!dx && e.shiftKey) dx = e.deltaY;
      if (Math.abs(dx) <= Math.abs(e.deltaY) && !e.shiftKey) return; // mostly vertical: let the page scroll
      e.preventDefault();
      const now = performance.now();
      if (now - wheel.last > WHEEL_GESTURE_GAP_MS) wheel = { sum: 0, last: now, used: false };
      wheel.last = now;
      if (wheel.used) return;
      wheel.sum += dx;
      if (Math.abs(wheel.sum) >= WHEEL_STEP) {
        wheel.used = true;
        step(Math.sign(wheel.sum));
      }
    }

    // --- Keyboard: arrow keys move between days, Home/End jump to the ends -------------------------

    function onKeyDown(e) {
      const day = e.target.closest('.day');
      if (!day) return;
      const i = Number(day.dataset.index);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: days.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const j = clamp(next, 0, days.length - 1);
      setTabStop(day.parentElement, j);
      ensureVisible(j);
      day.parentElement.children[j].focus({ preventScroll: true });
    }

    function onFocusIn(e) {
      const day = e.target.closest('.day');
      if (!day || drag) return;
      const track = day.parentElement;
      // Screen readers can move focus to a day that is off screen; the browser then scrolls the
      // chart itself. Pick up from where it scrolled to, then settle on whole days.
      if (!frame) offset = clamp(track.scrollLeft / dayWidth(), 0, maxOffset());
      setTabStop(track, Number(day.dataset.index));
      ensureVisible(Number(day.dataset.index));
      if (!frame) goTo(offset, false);
    }

    tracks.forEach(t => {
      t.addEventListener('pointerdown', onPointerDown);
      t.addEventListener('pointermove', onPointerMove);
      t.addEventListener('pointerup', onPointerUp);
      t.addEventListener('pointercancel', onPointerCancel);
      t.addEventListener('click', onClickCapture, true);
      t.addEventListener('wheel', onWheel, { passive: false });
      t.addEventListener('keydown', onKeyDown);
      t.addEventListener('focusin', onFocusIn);
      t.addEventListener('dragstart', e => e.preventDefault());
    });

    prevButtons.forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') step(-1);
    }));
    nextButtons.forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') step(1);
    }));

    new ResizeObserver(layout).observe(tempTrack);

    return {
      render,
      refresh: layout,
      dayElements: i => [tempTrack.children[i], rainTrack.children[i]]
    };
  }

  return { create };
})();
