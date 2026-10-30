/* =============================================================================
   voice.js: the "Tell us more" box: a voice note OR typed text.

   WHAT THE PARTNER SEES
   - A big "Hold to talk" button. The first time, a one-line consent message
     appears first ("Your voice note is shared only with the Valmo team...")
     with an OK button; after OK the phone asks for microphone permission.
   - While holding: the button turns red, a countdown shows the seconds left
     (hard cap: voice.max_seconds, default 60). Releasing stops the recording.
     With "gesture": "tap" in survey.json it is tap-to-start / tap-to-stop.
   - After recording: Play / Delete, and the button changes to "Record again".
   - A "Type instead" link opens a text box (any language or script).
   - If the phone cannot record, or the partner blocks the microphone, the
     button disappears and the text box is shown instead. Nothing breaks.

   WHERE RECORDINGS GO
   - The recording (webm/opus, mono, low bitrate) is turned into base64 text
     and kept in memory AND in the phone's storage (so it survives a reload).
     Storage can be full; then it is kept in memory only.
   - It is sent inside the submission (docs/submission-format.md) and deleted
     from the phone after a successful send.

   Settings ("voice" in the questionnaire: control panel > Settings > Voice
   notes, or web/config/survey.json): enabled, gesture, max_seconds,
   min_seconds, bitrate, mime_types. Nothing here needs editing.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var voice = PP.voice = {};

  var memory = {}; // storage key -> base64 recording

  /* Own keys only. A legal answer code such as "constructor" must never find
     what every JavaScript object inherits: the typing box would show
     "function Object() ..." and a voice note that does not exist would
     count. web/js/app.js already keeps state.texts and state.audio as maps
     that inherit nothing; this guards any other caller too. */
  function own(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }

  /* Recordings still being finished (stop -> convert -> save). app.js waits
     for these before sending, so a note recorded at the last second is not lost. */
  var busy = 0;
  var idleWaiters = [];
  function busyStart() { busy += 1; }
  function busyEnd() {
    busy = Math.max(0, busy - 1);
    if (!busy) {
      var waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach(function (fn) { fn(); });
    }
  }
  /* Is any voice note being recorded right now? (The read-aloud button stays
     silent meanwhile, so its voice never ends up inside a recording.) */
  var recordingNow = 0;
  voice.isRecording = function () { return recordingNow > 0; };

  /* Is a recording still being finished? (app.js keeps the finished answers
     for later sends only once none is: buildPayload.) */
  voice.isBusy = function () { return busy > 0; };

  /* Resolves when no recording is being finished (or after 5 s at most). */
  voice.whenIdle = function () {
    if (!busy) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      idleWaiters.push(finish);
      setTimeout(finish, 5000);
    });
  };

  /* Which audio format can this phone record? '' = "phone's default". null = cannot record. */
  voice.pickMime = function (list) {
    if (!root.MediaRecorder) return null;
    if (typeof root.MediaRecorder.isTypeSupported !== 'function') return '';
    for (var i = 0; i < (list || []).length; i++) {
      try {
        if (root.MediaRecorder.isTypeSupported(list[i])) return list[i];
      } catch (e) { /* try the next one */ }
    }
    return '';
  };

  /* Can this phone record voice notes in the browser at all? */
  voice.isSupported = function (config) {
    var cfg = (config && config.voice) || {};
    if (cfg.enabled === false) return false;
    if (!root.MediaRecorder || !root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    if (root.isSecureContext === false) return false; // microphones need https (or localhost)
    return voice.pickMime(cfg.mime_types) !== null;
  };

  /* ---- Storing recordings ------------------------------------------------- */
  function audioKey(ns, itemId) { return 'audio:' + ns + ':' + itemId; }

  voice.saveAudio = function (ns, itemId, b64) {
    var k = audioKey(ns, itemId);
    memory[k] = b64;
    return PP.store.set(k, b64);
  };
  voice.loadAudio = function (ns, itemId) {
    var k = audioKey(ns, itemId);
    return memory[k] || PP.store.get(k);
  };
  voice.dropAudio = function (ns, itemId) {
    var k = audioKey(ns, itemId);
    delete memory[k];
    PP.store.remove(k);
  };
  voice.dropAll = function (ns) {
    var prefix = audioKey(ns, '');
    Object.keys(memory).forEach(function (k) { if (k.indexOf(prefix) === 0) delete memory[k]; });
    PP.store.removePrefix(prefix);
  };

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || '');
        var comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, mime) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'audio/webm' });
  }

  function formatSeconds(sec) {
    var s = Math.max(0, Math.round(sec || 0));
    var rest = s % 60;
    return Math.floor(s / 60) + ':' + (rest < 10 ? '0' : '') + rest;
  }

  /* ---------------------------------------------------------------------------
     The widget.
     opts = {
       itemId      : e.g. "fn_deep_dive:payments", "support_comment", "one_fix"
       ns          : storage namespace for this link ("<round>:<dc>")
       config      : survey.json
       state       : the app's saved state (texts, audio, voice_consent, voice_denied)
       save()      : save state now
       saveSoon()  : save state in a moment (while typing)
       onChange()  : text or voice note changed (app refreshes the Next button)
       onActivity(): the partner did something (app sends the "started" ping)
       onCleanup(fn): register fn to run when the partner leaves this screen
     }
     ------------------------------------------------------------------------- */
  voice.widget = function (opts) {
    var t = PP.t;
    var h = PP.h;
    var config = opts.config;
    var vcfg = config.voice || {};
    var state = opts.state;
    var itemId = opts.itemId;
    var holdMode = vcfg.gesture !== 'tap';
    var maxS = Number(vcfg.max_seconds) || 60;
    var minS = vcfg.min_seconds === undefined ? 1 : Number(vcfg.min_seconds);
    var maxChars = (config.text && Number(config.text.max_chars)) || 1500;
    var supported = voice.isSupported(config);

    // maps that inherit nothing, like app.js keeps them (read with own() below)
    state.texts = state.texts || Object.create(null);
    state.audio = state.audio || Object.create(null);

    /* ---- Build the elements -------------------------------------------- */
    var consentOk = h('button', { type: 'button', 'class': 'btn btn-primary' }, t('voice.consent_ok'));
    var consentBox = h('div', { 'class': 'consent', hidden: true }, [h('p', { text: t('voice.consent') }), consentOk]);
    var micLabel = h('span', { 'class': 'mic-label' });
    var micBtn = h('button', { type: 'button', 'class': 'mic-btn' }, [PP.icon('mic'), micLabel]);
    var status = h('p', { 'class': 'rec-status', 'aria-live': 'polite' });
    var playBtn = h('button', { type: 'button', 'class': 'icon-btn' });
    var clipTime = h('span', { 'class': 'clip-time' });
    var delBtn = h('button', { type: 'button', 'class': 'icon-btn' }, [PP.icon('trash'), t('voice.delete')]);
    var clipRow = h('div', { 'class': 'clip-row', hidden: true }, [playBtn, clipTime, delBtn]);
    var typeBtn = h('button', { type: 'button', 'class': 'link-btn' }, [t('text.type_instead')]);
    var typeRow = h('div', { 'class': 'type-row' }, typeBtn);
    var textarea = h('textarea', {
      'class': 'text-input',
      rows: 3,
      maxlength: maxChars,
      placeholder: t('text.placeholder'),
      'aria-label': t('text.placeholder'),
      autocomplete: 'off',
      hidden: true
    });
    textarea.value = own(state.texts, itemId) || '';

    var wrap = h('div', { 'class': 'tell' }, [consentBox, micBtn, status, clipRow, typeRow, textarea]);

    /* ---- Recording state ------------------------------------------------ */
    var phase = 'idle'; // idle | starting | recording
    var pressed = false;
    var stopWhenStarted = false;
    var destroyed = false;
    var stream = null;
    var recorder = null;
    var chunks = [];
    var startedAt = 0;
    var maxTimer = null;
    var tickTimer = null;
    var objectUrl = null;
    var audioEl = null;

    function constraints() {
      return { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    }

    function tooShortText() {
      return t(holdMode ? 'voice.too_short' : 'voice.too_short_tap');
    }

    function idleLabel() {
      if (own(state.audio, itemId)) return t('voice.redo');
      return holdMode ? t('voice.hold') : t('voice.tap_start');
    }

    function setPhase(p) {
      if (p === 'recording' && phase !== 'recording') recordingNow += 1;
      if (p !== 'recording' && phase === 'recording') recordingNow = Math.max(0, recordingNow - 1);
      phase = p;
      micBtn.classList.toggle('is-recording', p === 'recording');
      micBtn.classList.toggle('is-starting', p === 'starting');
      if (p === 'idle') micLabel.textContent = idleLabel();
      else if (p === 'starting') micLabel.textContent = t('voice.starting');
      else micLabel.textContent = holdMode ? t('voice.recording') : t('voice.recording_tap');
    }

    function setStatus(text, isError, withDot) {
      PP.clear(status);
      status.classList.toggle('is-error', Boolean(isError));
      if (withDot) status.appendChild(h('span', { 'class': 'rec-dot', 'aria-hidden': 'true' }));
      if (text) status.appendChild(document.createTextNode(text));
    }

    function releaseStream() {
      if (stream) {
        try { stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) { /* ignore */ }
      }
      stream = null;
    }

    function showTextInstead() {
      micBtn.hidden = true;
      consentBox.hidden = true;
      typeRow.hidden = true;
      textarea.hidden = false;
    }

    /* Microphone blocked, missing or busy: switch to typing. */
    function handleMicError(err) {
      var name = err && err.name;
      clearTimeout(maxTimer);
      clearInterval(tickTimer);
      releaseStream();
      recorder = null;
      setPhase('idle');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError' ||
          name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        state.voice_denied = true; // remember: do not offer the mic again on this phone
        opts.save();
      }
      showTextInstead();
      setStatus(t('voice.denied'), true);
    }

    /* ---- Consent (once per phone and link) ------------------------------ */
    function showConsent() {
      consentBox.hidden = false;
      micBtn.hidden = true;
      try { consentOk.focus(); } catch (e) { /* ignore */ }
    }

    consentOk.addEventListener('click', function () {
      state.voice_consent = true;
      opts.save();
      consentBox.hidden = true;
      micBtn.hidden = false;
      // Ask for microphone permission right now, so the phone's own question
      // appears straight away instead of in the middle of a hold.
      setStatus(t('voice.starting'));
      navigator.mediaDevices.getUserMedia(constraints()).then(function (s) {
        s.getTracks().forEach(function (tr) { tr.stop(); });
        if (!destroyed) setStatus(holdMode ? t('voice.ready') : t('voice.ready_tap'));
      }, handleMicError);
    });

    /* ---- Recording ------------------------------------------------------ */
    function tick() {
      var elapsed = (Date.now() - startedAt) / 1000;
      setStatus(t('voice.seconds_left', { s: Math.max(0, Math.ceil(maxS - elapsed)) }), false, true);
    }

    function startRecording() {
      if (PP.speech) PP.speech.stop(); // never record the read-aloud voice
      if (audioEl) audioEl.pause();
      stopWhenStarted = false;
      setPhase('starting');
      setStatus('');
      navigator.mediaDevices.getUserMedia(constraints()).then(function (s) {
        stream = s;
        if (destroyed) {
          releaseStream();
          return;
        }
        if ((holdMode && !pressed) || stopWhenStarted) {
          // Finger lifted (or tapped again) before the mic was ready.
          releaseStream();
          setPhase('idle');
          setStatus(tooShortText(), true);
          return;
        }
        var mime = voice.pickMime(vcfg.mime_types);
        var options = { audioBitsPerSecond: Number(vcfg.bitrate) || 16000 };
        if (mime) options.mimeType = mime;
        try {
          recorder = new MediaRecorder(s, options);
        } catch (e) {
          try { recorder = new MediaRecorder(s); } catch (e2) { handleMicError(e2); return; }
        }
        chunks = [];
        recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
        recorder.onstop = finalize;
        recorder.onerror = function () { stopRecording(); };
        recorder.start(1000);
        startedAt = Date.now();
        setPhase('recording');
        tick();
        tickTimer = setInterval(tick, 500);
        maxTimer = setTimeout(stopRecording, maxS * 1000);
      }, handleMicError);
    }

    function stopRecording() {
      clearTimeout(maxTimer);
      clearInterval(tickTimer);
      if (recorder && recorder.state !== 'inactive') {
        busyStart(); // finalize() calls busyEnd()
        try { recorder.stop(); } catch (e) { finalize(); } // recorder.onstop -> finalize()
      } else {
        releaseStream();
        if (!destroyed) setPhase('idle');
      }
    }

    function finalize() {
      clearTimeout(maxTimer);
      clearInterval(tickTimer);
      var durationS = Math.min(maxS, (Date.now() - startedAt) / 1000);
      var type = (recorder && recorder.mimeType) || (chunks[0] && chunks[0].type) || 'audio/webm';
      var blob = new Blob(chunks, { type: type });
      recorder = null;
      chunks = [];
      releaseStream();
      setPhase('idle');
      if (durationS < minS || !blob.size) {
        setStatus(tooShortText(), true);
        busyEnd();
        return;
      }
      blobToBase64(blob).then(function (b64) {
        // false = the phone's storage is full: the note is kept in memory only,
        // so it is lost if the page is closed before the survey is sent.
        var storedOnPhone = voice.saveAudio(opts.ns, itemId, b64);
        state.audio[itemId] = { mime: type, duration_s: Math.round(durationS * 10) / 10, bytes: blob.size };
        opts.save();
        opts.onActivity();
        opts.onChange();
        busyEnd();
        if (destroyed) return;
        setLocalBlob(blob);
        showClip();
        setPhase('idle');
        if (storedOnPhone) setStatus(t('voice.saved'));
        else setStatus(t('voice.not_saved'), true);
      }, function () {
        busyEnd();
        setStatus(t('voice.denied'), true);
      });
    }

    /* ---- Press / hold handling ------------------------------------------ */
    function onHoldStart() {
      if (!state.voice_consent) { showConsent(); return; }
      pressed = true;
      if (phase === 'idle') startRecording();
    }
    function onHoldEnd() {
      if (!pressed) return;
      pressed = false;
      if (phase === 'recording') stopRecording();
      else if (phase === 'starting') stopWhenStarted = true;
    }
    function onTap() {
      if (!state.voice_consent) { showConsent(); return; }
      if (phase === 'idle') startRecording();
      else if (phase === 'recording') stopRecording();
      else stopWhenStarted = true;
    }

    if (holdMode) {
      if (root.PointerEvent) {
        micBtn.addEventListener('pointerdown', function (e) {
          if (e.button !== undefined && e.button !== 0) return; // main finger / left button only
          e.preventDefault();
          try { micBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          onHoldStart();
        });
        micBtn.addEventListener('pointerup', onHoldEnd);
        micBtn.addEventListener('pointercancel', onHoldEnd);
        micBtn.addEventListener('lostpointercapture', onHoldEnd);
      } else {
        // Very old browsers without pointer events
        micBtn.addEventListener('touchstart', function (e) { e.preventDefault(); onHoldStart(); });
        micBtn.addEventListener('touchend', onHoldEnd);
        micBtn.addEventListener('touchcancel', onHoldEnd);
        micBtn.addEventListener('mousedown', onHoldStart);
        micBtn.addEventListener('mouseup', onHoldEnd);
      }
      // Keyboard: hold Space or Enter
      micBtn.addEventListener('keydown', function (e) {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); onHoldStart(); }
      });
      micBtn.addEventListener('keyup', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onHoldEnd(); }
      });
      micBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    } else {
      micBtn.addEventListener('click', onTap);
    }

    /* ---- Playing back / deleting the note -------------------------------- */
    function setPlayIcon(playing) {
      PP.clear(playBtn);
      playBtn.appendChild(PP.icon(playing ? 'pause' : 'play'));
      playBtn.appendChild(document.createTextNode(t(playing ? 'voice.pause' : 'voice.play')));
    }

    function setLocalBlob(blob) {
      if (audioEl) { audioEl.pause(); audioEl = null; }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
    }

    function showClip() {
      var clip = own(state.audio, itemId);
      clipRow.hidden = !clip;
      if (clip) {
        clipTime.textContent = formatSeconds(clip.duration_s);
        setPlayIcon(false);
      }
    }

    playBtn.addEventListener('click', function () {
      if (!audioEl) {
        if (!objectUrl) {
          var b64 = voice.loadAudio(opts.ns, itemId);
          var clip = own(state.audio, itemId);
          if (!b64 || !clip) return;
          try { setLocalBlob(base64ToBlob(b64, clip.mime)); } catch (e) { return; }
        }
        audioEl = new Audio(objectUrl);
        audioEl.onended = function () { setPlayIcon(false); };
        audioEl.onpause = function () { setPlayIcon(false); };
      }
      if (audioEl.paused) {
        if (PP.speech) PP.speech.stop();
        setPlayIcon(true);
        var p = audioEl.play();
        if (p && p.catch) p.catch(function () { setPlayIcon(false); });
      } else {
        audioEl.pause();
      }
    });

    delBtn.addEventListener('click', function () {
      if (audioEl) { audioEl.pause(); audioEl = null; }
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      voice.dropAudio(opts.ns, itemId);
      delete state.audio[itemId];
      opts.save();
      opts.onChange();
      showClip();
      setPhase('idle');
      setStatus('');
    });

    /* ---- Typing ----------------------------------------------------------- */
    typeBtn.addEventListener('click', function () {
      textarea.hidden = false;
      typeRow.hidden = true;
      try { textarea.focus(); } catch (e) { /* ignore */ }
    });

    textarea.addEventListener('input', function () {
      state.texts[itemId] = textarea.value;
      opts.saveSoon();
      opts.onActivity();
      opts.onChange();
    });

    /* ---- Leaving the screen / hiding the page ------------------------------ */
    function onVisibility() {
      if (document.visibilityState === 'hidden' && phase === 'recording') stopRecording();
    }
    document.addEventListener('visibilitychange', onVisibility);

    opts.onCleanup(function () {
      pressed = false;
      if (phase === 'recording') stopRecording(); // finalize() still saves the note
      else if (phase === 'starting') stopWhenStarted = true;
      destroyed = true;
      if (audioEl) audioEl.pause();
      document.removeEventListener('visibilitychange', onVisibility);
    });

    /* ---- Initial look ------------------------------------------------------ */
    if (!supported || state.voice_denied) {
      showTextInstead();
    } else {
      var hasText = Boolean(textarea.value.trim());
      textarea.hidden = !hasText;
      typeRow.hidden = hasText;
    }
    setPhase('idle');
    showClip();

    return wrap;
  };

}(typeof window !== 'undefined' ? window : globalThis));
