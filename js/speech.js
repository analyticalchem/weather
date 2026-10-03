// Read-aloud engine, built on the browser's speech synthesis (on a Chromebook, the voices built into ChromeOS).
// Text is queued one sentence at a time because Chrome can cut off a single long utterance.
// Whatever is being read gets the "is-reading" class so it is outlined on screen.
window.Weather = window.Weather || {};

Weather.speech = (function () {
  const synth = window.speechSynthesis;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';
  const listeners = [];

  let session = 0;        // bumped on every speak/stop so callbacks from old speech are ignored
  let speaking = false;
  let highlighted = [];
  let utterances = [];    // kept referenced: Chrome may drop end events for utterances it garbage-collects
  let watchdog = 0;

  function setHighlight(els) {
    highlighted.forEach(el => el.classList.remove('is-reading'));
    highlighted = (els || []).filter(Boolean);
    highlighted.forEach(el => el.classList.add('is-reading'));
  }

  function setSpeaking(on) {
    if (speaking === on) return;
    speaking = on;
    listeners.forEach(fn => fn(on));
  }

  function sentences(text) {
    return (text.match(/[^.!?]+[.!?]*/g) || [text]).map(s => s.trim()).filter(Boolean);
  }

  function finish() {
    clearInterval(watchdog);
    utterances = [];
    setHighlight(null);
    setSpeaking(false);
  }

  function stop() {
    session++;
    if (supported) synth.cancel();
    finish();
  }

  // segments: a string, or a list of { text, els } so each part of the screen is outlined as it is read.
  function speak(segments, options) {
    stop();
    if (!supported) return false;
    if (typeof segments === 'string') segments = [{ text: segments, els: options && options.els }];

    const id = ++session;
    const queue = [];
    segments.forEach(seg => {
      sentences(seg.text).forEach((text, i) => queue.push({ text, els: i === 0 ? seg.els : null }));
    });
    if (!queue.length) return false;

    const rate = Weather.settings.rate();
    utterances = queue.map((item, i) => {
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = 'en-US';
      u.rate = rate;
      if (item.els) u.onstart = () => { if (id === session) setHighlight(item.els); };
      if (i === queue.length - 1) u.onend = () => { if (id === session) finish(); };
      u.onerror = e => {
        if (id === session && e.error !== 'interrupted' && e.error !== 'canceled') finish();
      };
      return u;
    });

    synth.resume(); // Chrome can be left paused; resuming is harmless otherwise
    utterances.forEach(u => synth.speak(u));
    setHighlight(queue[0].els);
    setSpeaking(true);

    // Safety net: if the engine goes quiet without telling us, reset the button.
    const started = Date.now();
    watchdog = setInterval(() => {
      if (id !== session) return clearInterval(watchdog);
      if (Date.now() - started > 2000 && !synth.speaking && !synth.pending) finish();
    }, 500);
    return true;
  }

  return {
    supported,
    speak,
    stop,
    isSpeaking: () => speaking,
    isReading: el => speaking && highlighted.includes(el),
    onChange: fn => listeners.push(fn)
  };
})();
