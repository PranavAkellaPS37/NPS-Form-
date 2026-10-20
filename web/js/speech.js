/* =============================================================================
   speech.js: the read-aloud (speaker) button shown next to each question.

   HOW IT DECIDES WHAT TO PLAY, for each piece of text on the screen:
   1. If web/config/audio_clips.json has a pre-recorded mp3 for that text key in
      that language, play the mp3 (best quality, works on every phone).
   2. Otherwise use the phone's built-in voice (the browser's speechSynthesis)
      in the right language, e.g. "hi-IN" for Hindi.
   3. If some text on the screen can be played neither way, the speaker button
      HIDES itself (half-reading a question would only confuse).
   Texts still marked [TRANSLATE] are shown in English, so they are also read
   with an English voice.

   The phone's list of voices often arrives a moment after the page loads, so
   buttons re-check themselves when it does (onVoicesChanged).

   Nothing here needs editing: switch read-aloud off with
   "read_aloud": { "enabled": false } in web/config/survey.json.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};

  var speech = PP.speech = {
    enabled: true,
    clips: {},
    voices: [],
    _queue: [],
    _speaking: false,
    _audio: null,
    _onEnd: null,
    _buttons: []
  };

  /* Called once by app.js. clipsFile = contents of audio_clips.json (or null). */
  speech.init = function (config, clipsFile) {
    speech.enabled = !(config && config.read_aloud && config.read_aloud.enabled === false);
    speech.clips = (clipsFile && clipsFile.clips) || {};
    var synth = root.speechSynthesis;
    if (!synth) return;

    var load = function () {
      try { speech.voices = synth.getVoices() || []; } catch (e) { speech.voices = []; }
      speech.refreshButtons();
    };
    load();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', load);
    else synth.onvoiceschanged = load;
  };

  speech.setClips = function (clipsFile) {
    speech.clips = (clipsFile && clipsFile.clips) || {};
    speech.refreshButtons();
  };

  function norm(tag) { return String(tag || '').replace('_', '-').toLowerCase(); }

  /* Best phone voice for a language tag like "ta-IN", or null. */
  speech.voiceFor = function (bcp47) {
    if (!speech.voices.length) return null;
    var want = norm(bcp47);
    var base = want.split('-')[0];
    var exact = null;
    var partial = null;
    speech.voices.forEach(function (v) {
      var l = norm(v.lang);
      if (l === want) {
        if (!exact || (v.localService && !exact.localService)) exact = v;
      } else if (!partial && l.split('-')[0] === base) {
        partial = v;
      }
    });
    return exact || partial;
  };

  /* items = [ { key: 'q.nps' } or { text: '...', lang: 'hi' } ]
     Returns the list of things to play, or null if any item cannot be played. */
  speech.resolve = function (items) {
    if (!items || !items.length) return null;
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var text;
      var lang;
      var clip = null;
      if (item.key) {
        var info = PP.i18n.info(item.key);
        text = info.text;
        lang = info.lang;
        var byLang = speech.clips[item.key];
        if (byLang && byLang[lang]) clip = byLang[lang];
      } else {
        text = item.text;
        lang = item.lang;
      }
      if (!text) continue;
      if (clip) {
        parts.push({ clip: clip });
        continue;
      }
      if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return null;
      var bcp = PP.i18n.bcp47(lang);
      var voice = speech.voiceFor(bcp);
      if (!voice) return null;
      parts.push({ text: text, voice: voice, bcp: bcp });
    }
    return parts.length ? parts : null;
  };

  speech.canSpeak = function (items) {
    return speech.enabled && speech.resolve(items) !== null;
  };

  /* Play the items one after another; onEnd() runs when done or stopped. */
  speech.speak = function (items, onEnd) {
    speech.stop();
    var parts = speech.resolve(items);
    if (!parts) {
      if (onEnd) onEnd();
      return;
    }
    speech._queue = parts.slice();
    speech._onEnd = onEnd || null;
    speech._speaking = true;
    playNext();
  };

  function playNext() {
    if (!speech._speaking) return;
    var part = speech._queue.shift();
    if (!part) {
      finish();
      return;
    }
    var done = false;
    var advance = function () {
      if (done) return;
      done = true;
      playNext();
    };
    if (part.clip) {
      var audio = new Audio(part.clip);
      speech._audio = audio;
      audio.onended = advance;
      audio.onerror = advance;
      var p = audio.play();
      if (p && p.catch) p.catch(advance);
    } else {
      var u = new SpeechSynthesisUtterance(part.text);
      u.lang = part.voice.lang || part.bcp;
      u.voice = part.voice;
      u.rate = 0.95;
      u.onend = advance;
      u.onerror = advance;
      root.speechSynthesis.speak(u);
    }
  }

  function finish() {
    speech._speaking = false;
    var cb = speech._onEnd;
    speech._onEnd = null;
    if (cb) cb();
  }

  speech.stop = function () {
    var wasSpeaking = speech._speaking;
    speech._speaking = false;
    speech._queue = [];
    if (speech._audio) {
      try { speech._audio.pause(); } catch (e) { /* ignore */ }
      speech._audio = null;
    }
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    var cb = speech._onEnd;
    speech._onEnd = null;
    if (wasSpeaking && cb) cb();
  };

  /* ---------------------------------------------------------------------------
     The speaker button. getItems() returns what to read (see resolve above).
     ------------------------------------------------------------------------- */
  speech.button = function (getItems) {
    var btn = PP.h('button', { type: 'button', 'class': 'speak-btn', hidden: true });
    var setIdle = function () {
      btn.classList.remove('is-speaking');
      PP.clear(btn);
      btn.appendChild(PP.icon('speaker'));
      btn.setAttribute('aria-label', PP.t('ui.listen'));
    };
    setIdle();
    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-speaking')) {
        speech.stop();
        return;
      }
      // Never speak while a voice note is being recorded (it would be recorded too).
      if (PP.voice && PP.voice.isRecording && PP.voice.isRecording()) return;
      btn.classList.add('is-speaking');
      PP.clear(btn);
      btn.appendChild(PP.icon('stop'));
      btn.setAttribute('aria-label', PP.t('ui.stop_listening'));
      speech.speak(getItems(), setIdle);
    });
    btn._ppUpdate = function () { btn.hidden = !speech.canSpeak(getItems()); };
    btn._ppUpdate();
    speech._buttons.push(btn);
    return btn;
  };

  /* Re-check every speaker button still on the page (voices may arrive late). */
  speech.refreshButtons = function () {
    speech._buttons = speech._buttons.filter(function (b) { return document.body.contains(b); });
    speech._buttons.forEach(function (b) { b._ppUpdate(); });
  };

}(typeof window !== 'undefined' ? window : globalThis));
