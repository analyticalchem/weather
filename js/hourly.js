// The hour-by-hour graph for one day, under each 7-day chart.
//   Rain:        a bar for every hour (0-100%).
//   Temperature: a solid line for the temperature and a dashed line for "feels like".
//
// The graph's baseline splits it into two kinds of targets:
//   - Above the baseline, every hour: point at a bar (or point) to highlight that hour, click to hear it.
//   - Below the baseline, time blocks (every 2 to 12 hours, as many as the width and text size allow),
//     each numbered with its first hour. Clicking a block chooses it and reads its hours; a thick box
//     marks the chosen block. Clicking the chosen block again reads it again, and a second click stops.
// Highlights stay on their own side of the baseline.
//
// The temperature rows are named ("Temp", "Feels like") in a column on the left. When that column would
// leave room for only a few blocks (large text, narrow screens), the names move above their rows.
window.Weather = window.Weather || {};

Weather.hourly = (function () {
  const LABEL_STEPS = [2, 3, 4, 6, 8, 12]; // hours per block (each divides 24)
  const LABEL_GAP_REM = 0.8;               // space between neighboring numbers
  const STACK_ABOVE_STEP = 4;              // names move above their rows if beside them allows fewer than 24/4 blocks
  const DEFAULT_NAME_COLUMN_REM = 4.5;     // width of the row-name column until it has been measured
  const PLOT_PAD = 12;                     // % of the temperature plot kept clear at the top and bottom
  const MIN_TEMP_SPAN = 10;                // degrees; stops a nearly flat day from looking dramatic
  const NOW_LABEL_FLIP = 80;               // % across: past this, the "Now" label sits left of its line

  const words = Weather.words;
  const speech = Weather.speech;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(k => node.setAttribute(k, attrs[k]));
    return node;
  }

  function readable(node, say) {
    node.dataset.say = say;
    node.setAttribute('aria-label', say);
  }

  const pct = (index, n) => (index / n * 100).toFixed(3) + '%';

  // kind: 'temp' or 'rain'. onSelectHour(hour) is called when someone chooses a time block.
  function create({ kind, graph, titleButton, dayPill, onSelectHour }) {
    // The rain numbers explain themselves ("30%"), so only the temperature rows get names.
    const rows = kind === 'temp'
      ? [
        { key: 'temp', name: 'Temp', line: 'line-temp', className: 'hg-values' },
        { key: 'feels', name: 'Feels like', line: 'line-feels', className: 'hg-values hg-feels' }
      ]
      : [{ key: 'rain', className: 'hg-values' }];
    const format = (key, hour) => (key === 'rain' ? hour.rain + '%' : words.temp(hour[key]));
    const sentence = hour => (kind === 'temp' ? words.hourTemp(hour) : words.hourRain(hour));
    const speechTag = `${kind}-block`;

    let state = null;      // { hours, label, nowHour }; nowHour is the place's time (today only) or null
    let selectedHour = 0;  // any hour inside the chosen block
    let step = 0;          // hours per block; 0 forces a redraw
    let stacked = false;   // row names above their rows instead of beside them
    let nameColumnRem = DEFAULT_NAME_COLUMN_REM;
    const tabStops = { hour: 0, block: 0 }; // one Tab stop for the hours, one for the blocks

    // Layout: a grid holding the plot, the hour row and each number row (with its name); a layer below
    // the baseline with block dividers; and a layer of click targets over everything.
    const grid = el('div', 'hg hg-' + kind);
    const plot = cell('hg-plot hg-plot-' + kind);
    const hourRow = cell('hg-hours');
    const names = [];
    const valueRows = rows.map(row => {
      if (row.name) names.push(rowName(row));
      return cell(row.className);
    });
    const blockLayer = cell('hg-blocks');
    blockLayer.parentElement.classList.add('hg-blocks-cell');
    const hits = cell('hg-hits');
    hits.parentElement.classList.add('hg-hits-cell');
    // Screen readers get the hour and block buttons, which say everything; the drawing and the rows of
    // numbers under it would only be read as a jumble of loose numbers.
    [plot, hourRow, ...valueRows, blockLayer].forEach(c => c.parentElement.setAttribute('aria-hidden', 'true'));
    // A forecast saved before hourly numbers were added has none until the next refresh.
    const empty = el('p', 'hg-empty', 'The hour-by-hour forecast will appear the next time the weather is updated.');
    empty.hidden = true;
    graph.replaceChildren(grid, empty);
    placeRows();

    function cell(className) {
      const outer = el('div', 'hg-cell');
      const inner = el('div', 'hg-inner ' + className);
      outer.append(inner);
      grid.append(outer);
      return inner;
    }

    // "Temp" and "Feels like" each show a sample of their line, so the rows explain the graph.
    function rowName(row) {
      const name = el('div', 'hg-label');
      name.setAttribute('aria-hidden', 'true');
      name.append(el('span', null, row.name));
      const sample = svgEl('svg', { viewBox: '0 0 40 10', class: 'hg-sample' });
      sample.append(svgEl('line', { x1: 3, y1: 5, x2: 37, y2: 5, class: row.line }));
      name.append(sample);
      grid.append(name);
      return name;
    }

    // Beside: [name | numbers] on one grid row. Stacked: the name on its own grid row above the numbers.
    function placeRows() {
      grid.classList.toggle('hg-stacked', stacked);
      grid.classList.toggle('hg-one-column', stacked || !names.length);
      plot.parentElement.style.gridRow = 1;
      hourRow.parentElement.style.gridRow = 2;
      let next = 3;
      valueRows.forEach((rowEl, i) => {
        if (names[i]) {
          names[i].style.gridRow = next;
          if (stacked) next++;
        }
        rowEl.parentElement.style.gridRow = next++;
      });
      blockLayer.parentElement.style.gridRow = `2 / ${next}`; // below the baseline only
      hits.parentElement.style.gridRow = `1 / ${next}`;
    }

    function render(day, label, nowHour, hour) {
      // Keyboard focus on an hour or a block stays there when the graph is redrawn with new numbers.
      const active = document.activeElement;
      const refocus = active && hits.contains(active)
        ? (active.classList.contains('hg-hour-hit') ? `.hg-hour-hit[data-hour="${active.dataset.hour}"]` : '.hg-chosen')
        : null;

      const hours = Array.isArray(day.hours) ? day.hours : [];
      dayPill.textContent = label;
      grid.hidden = !hours.length;
      empty.hidden = !!hours.length;
      if (!hours.length) {
        state = null;
        readable(titleButton, `Hour by hour for ${label}. ${empty.textContent}`);
        return;
      }
      state = { hours, label, nowHour };
      selectedHour = hour;
      readable(titleButton, kind === 'temp' ? words.tempHourly(hours, label) : words.rainHourly(hours, label));
      step = 0;
      layout();

      const target = refocus && hits.querySelector(refocus);
      if (target) {
        const row = rowOf(target);
        tabStops[row] = Number(target.dataset.pos);
        updateTabStops();
        target.focus({ preventScroll: true });
      }
    }

    // Moves the "Now" line as time passes, without redrawing anything else.
    function setNow(nowHour) {
      if (!state || state.nowHour == null || !step) return;
      state.nowHour = nowHour;
      const old = plot.querySelector('.hg-now');
      if (old) old.remove();
      drawNow(state.hours.length);
    }

    // Chooses a different block without redrawing the graph. Keyboard focus stays on the chosen block.
    function setSelectedHour(hour) {
      selectedHour = hour;
      if (!state || !step) return;
      const hadFocus = !!document.activeElement && document.activeElement.classList.contains('hg-block-hit') &&
        hits.contains(document.activeElement);
      drawBlocks();
      if (hadFocus) {
        const chosen = hits.querySelector('.hg-chosen');
        tabStops.block = Number(chosen.dataset.pos);
        updateTabStops();
        chosen.focus({ preventScroll: true });
      }
    }

    // Widest text a row will show, measured with the row's own font.
    function widestPx(rowEl, texts) {
      const probe = el('span', 'hg-tick');
      probe.style.visibility = 'hidden';
      rowEl.append(probe);
      let widest = 0;
      new Set(texts).forEach(text => {
        probe.textContent = text;
        widest = Math.max(widest, probe.offsetWidth);
      });
      probe.remove();
      return widest;
    }

    // Picks the block size (and where the row names go) for the current width and text size,
    // and redraws if either changed.
    function layout() {
      if (!state) return;
      if (!plot.clientWidth) return; // hidden; runs again when shown
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const hours = state.hours;
      const n = hours.length;

      const spacing = LABEL_GAP_REM * remPx + Math.max(
        widestPx(hourRow, ['12 AM', '10 AM', '10 PM', 'Noon']),
        ...valueRows.map((rowEl, i) => widestPx(rowEl, hours.map(h => format(rows[i].key, h)))));
      const stepFor = width => LABEL_STEPS.find(s => width * s / n >= spacing) || LABEL_STEPS[LABEL_STEPS.length - 1];

      if (names.length && !stacked) {
        const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
        nameColumnRem = (Math.max(...names.map(nm => nm.offsetWidth)) + gap) / remPx;
      }
      const nameColumnPx = names.length ? nameColumnRem * remPx : 0;
      const widthStacked = plot.clientWidth + (stacked ? 0 : nameColumnPx);
      const widthBeside = widthStacked - nameColumnPx;
      const stepBeside = stepFor(widthBeside);
      const stepStacked = stepFor(widthStacked);
      const wantStacked = names.length > 0 && stepBeside > STACK_ABOVE_STEP && stepStacked < stepBeside;
      const newStep = wantStacked ? stepStacked : stepBeside;

      if (wantStacked !== stacked) {
        stacked = wantStacked;
        placeRows();
        step = 0;
      }
      if (newStep !== step) {
        step = newStep;
        draw();
      }
    }

    // Block starts, as indexes into hours.
    const blockStarts = () => state.hours.map((h, i) => i).filter(i => i % step === 0);

    function chosenStart() {
      const index = state.hours.findIndex(h => h.hour === selectedHour);
      return Math.floor(Math.max(0, index) / step) * step;
    }

    function tick(index, text) {
      const span = el('span', 'hg-tick', text);
      span.style.left = pct(index, state.hours.length);
      return span;
    }

    // Everything that depends on the day and block size.
    function draw() {
      const hours = state.hours;
      const n = hours.length;
      const x = i => (i + 0.5) / n * 100; // middle of each hour's slot, in % of the width
      const starts = blockStarts();

      plot.replaceChildren();
      if (kind === 'temp') drawTemp(hours, x, starts);
      else drawRain(hours);
      if (state.nowHour != null) drawNow(n);

      // Each block's first hour and its numbers, written at the left of the block.
      hourRow.replaceChildren(...starts.map(i => tick(i, words.hourLabel(hours[i].hour))));
      valueRows.forEach((rowEl, r) => {
        rowEl.replaceChildren(...starts.map(i => tick(i, format(rows[r].key, hours[i]))));
      });

      const dividers = starts.slice(1).map(i => {
        const line = el('span', 'hg-divider');
        line.style.left = pct(i, n);
        return line;
      });
      blockLayer.replaceChildren(...dividers);

      // Above the baseline: one target per hour, whichever block is chosen.
      hits.replaceChildren(...hours.map((h, i) => {
        const b = el('button', 'hg-hit hg-hour-hit readable');
        b.type = 'button';
        b.dataset.hour = h.hour;
        b.style.left = pct(i, n);
        b.style.width = pct(1, n);
        readable(b, sentence(h));
        return b;
      }));
      drawBlocks();
    }

    // Below the baseline: one target per block. The chosen one is drawn as a thick box.
    function drawBlocks() {
      const hours = state.hours;
      const n = hours.length;
      const chosen = chosenStart();
      hits.querySelectorAll('.hg-block-hit').forEach(b => b.remove());
      blockStarts().forEach(start => {
        const length = Math.min(step, n - start);
        const label = words.blockLabel(hours[start].hour, length);
        const isChosen = start === chosen;
        const b = el('button', 'hg-hit hg-block-hit ' + (isChosen ? 'hg-chosen' : 'hg-block'));
        b.type = 'button';
        b.dataset.start = start;
        b.style.left = pct(start, n);
        b.style.width = pct(length, n);
        b.setAttribute('aria-label', isChosen ? `${label}, chosen. Read every hour.` : `${label}. Choose and read these hours.`);
        hits.append(b);
      });
      // Tab lands on the chosen block, and on the current hour (or the chosen block's first hour).
      // Not while someone is already moving through the graph with the keyboard.
      if (!hits.contains(document.activeElement)) {
        const blocks = rowTargets('block');
        tabStops.block = Math.max(0, blocks.findIndex(b => b.classList.contains('hg-chosen')));
        const nowIndex = state.nowHour == null ? -1 : hours.findIndex(h => h.hour === Math.floor(state.nowHour));
        tabStops.hour = nowIndex >= chosen && nowIndex < chosen + step ? nowIndex : chosen;
      }
      updateTabStops();
    }

    // Arrow keys move within the hours or within the blocks; Tab moves between the two.
    function rowOf(hit) {
      return hit.classList.contains('hg-block-hit') ? 'block' : 'hour';
    }

    function rowTargets(row) {
      return [...hits.querySelectorAll(row === 'block' ? '.hg-block-hit' : '.hg-hour-hit')];
    }

    function updateTabStops() {
      ['hour', 'block'].forEach(row => {
        const targets = rowTargets(row);
        tabStops[row] = Math.min(tabStops[row], targets.length - 1);
        targets.forEach((t, i) => {
          t.dataset.pos = i;
          t.tabIndex = i === tabStops[row] ? 0 : -1;
        });
      });
    }

    function drawTemp(hours, x, starts) {
      const all = hours.flatMap(h => [h.temp, h.feels]);
      let lo = Math.min(...all);
      let hi = Math.max(...all);
      if (hi - lo < MIN_TEMP_SPAN) {
        const mid = (hi + lo) / 2;
        lo = mid - MIN_TEMP_SPAN / 2;
        hi = mid + MIN_TEMP_SPAN / 2;
      }
      const y = v => PLOT_PAD + (1 - (v - lo) / (hi - lo)) * (100 - 2 * PLOT_PAD);
      const points = key => hours.map((h, i) => `${x(i).toFixed(2)},${y(h[key]).toFixed(2)}`).join(' ');

      // Stretched to fit; the CSS keeps line thickness and dashes the same at any size.
      const svg = svgEl('svg', { class: 'hg-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      svg.append(svgEl('polyline', { class: 'line-feels', points: points('feels') }),
        svgEl('polyline', { class: 'line-temp', points: points('temp') }));
      plot.append(svg);

      // Dots mark each block's first hour: filled for temperature, hollow for feels like.
      starts.forEach(i => {
        [['feels', 'hg-dot hg-dot-feels'], ['temp', 'hg-dot hg-dot-temp']].forEach(([key, className]) => {
          const dot = el('span', className);
          dot.style.left = x(i).toFixed(3) + '%';
          dot.style.top = y(hours[i][key]).toFixed(3) + '%';
          plot.append(dot);
        });
      });
    }

    function drawRain(hours) {
      const bars = el('div', 'hg-bars');
      hours.forEach(h => {
        const slot = el('div', 'hg-slot');
        const bar = el('div', 'hg-bar');
        bar.style.height = h.rain + '%';
        slot.append(bar);
        bars.append(slot);
      });
      plot.append(bars);
    }

    // Today only: a line at the place's current time, so past and future hours are easy to tell apart.
    function drawNow(n) {
      const left = (state.nowHour + 0.5) / n * 100;
      const line = el('div', 'hg-now' + (left > NOW_LABEL_FLIP ? ' hg-now-left' : ''));
      line.style.left = Math.min(100, left).toFixed(3) + '%';
      line.setAttribute('aria-hidden', 'true');
      line.append(el('span', 'hg-now-label', 'Now'));
      plot.append(line);
    }

    // Reads the chosen block: its name, then each hour, outlining each hour's bar or point in turn.
    // The block itself already has its thick box, so it gets no extra outline.
    function readBlock() {
      if (speech.isSpeakingTag(speechTag)) {
        speech.stop();
        return;
      }
      const start = chosenStart();
      const blockHours = state.hours.slice(start, start + step);
      const parts = [{ text: words.blockSpoken(blockHours[0].hour, blockHours.length), els: [] }]
        .concat(blockHours.map(h => ({
          text: sentence(h),
          els: [hits.querySelector(`.hg-hour-hit[data-hour="${h.hour}"]`)]
        })));
      speech.speak(parts, { tag: speechTag });
    }

    // Clicking an hour chooses its block (in both graphs); the shared click-to-hear handler then reads
    // just that hour. Clicking another block chooses it and reads all its hours. Clicking the chosen
    // block reads it again; a second click stops.
    hits.addEventListener('click', e => {
      const hour = e.target.closest('.hg-hour-hit');
      const block = e.target.closest('.hg-block');
      if (hour) {
        onSelectHour(Number(hour.dataset.hour));
      } else if (block) {
        onSelectHour(state.hours[Number(block.dataset.start)].hour);
        if (Weather.settings.get().tapToRead) readBlock();
      } else if (e.target.closest('.hg-chosen') && Weather.settings.get().tapToRead) {
        readBlock();
      }
    });

    hits.addEventListener('keydown', e => {
      const hit = e.target.closest('.hg-hit');
      if (!hit) return;
      const row = rowOf(hit);
      const targets = rowTargets(row);
      const k = Number(hit.dataset.pos);
      const next = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: targets.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      tabStops[row] = Math.min(targets.length - 1, Math.max(0, next));
      updateTabStops();
      targets[tabStops[row]].focus();
    });

    new ResizeObserver(layout).observe(plot);

    return { render, setSelectedHour, setNow, refresh: layout };
  }

  return { create };
})();
