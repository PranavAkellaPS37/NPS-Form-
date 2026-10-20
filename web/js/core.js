/* =============================================================================
   core.js: small shared helpers used by every other file of the form.

   WHAT IS IN HERE
   - PP.store     : safe wrapper around the phone's storage (localStorage).
                    It never crashes, even in private mode or when storage is full;
                    the survey then simply keeps answers in memory.
   - PP.now       : current time as text, e.g. "2026-10-19T11:22:33.456Z" (UTC)
   - PP.randomId  : random ids like "sub_5c1d9e0f7a2b4c83"
   - PP.params    : reads ?dc=...&t=...&round=...&lang=...&mock=1 from the link
   - PP.h         : tiny helper that builds page elements from code
   - PP.icon      : the few small icons the form uses (drawn in code, no downloads)
   - PP.i18n/PP.t : looks up words in web/i18n/strings.json for the chosen language

   HOW THE FILES FIT TOGETHER (index.html loads them in this order)
     core.js    -> helpers (this file)
     flow.js    -> decides which screens to show and builds the data to send
     speech.js  -> the read-aloud (speaker) button
     voice.js   -> the voice-note recorder and the "type instead" box
     net.js     -> talking to the backend (mock server or Google Apps Script)
     screens.js -> draws each kind of screen
     app.js     -> starts everything and moves between screens

   You never need to edit this file to change the questionnaire: questions,
   languages, colours and rules all live in web/config/ and web/i18n/.

   COMPATIBILITY: written for old Android phones too (Chrome 61+), so it avoids
   newer JavaScript shortcuts such as ?. and ??.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};

  /* ---------------------------------------------------------------------------
     Safe storage. Every key is prefixed with "vpp:v1:" so we never clash with
     anything else stored on the phone.
     ------------------------------------------------------------------------- */
  var STORE_PREFIX = 'vpp:v1:';

  PP.store = {
    get: function (key) {
      try {
        var raw = root.localStorage.getItem(STORE_PREFIX + key);
        return raw === null ? null : JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    /* Returns true if saved, false if the phone refused (full / blocked). */
    set: function (key, value) {
      try {
        root.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try { root.localStorage.removeItem(STORE_PREFIX + key); } catch (e) { /* ignore */ }
    },
    /* Removes every key that starts with the given text (e.g. all voice notes of one link). */
    removePrefix: function (prefix) {
      try {
        var full = STORE_PREFIX + prefix;
        var doomed = [];
        for (var i = 0; i < root.localStorage.length; i++) {
          var k = root.localStorage.key(i);
          if (k && k.indexOf(full) === 0) doomed.push(k);
        }
        doomed.forEach(function (k) { root.localStorage.removeItem(k); });
      } catch (e) { /* ignore */ }
    }
  };

  /* ---------------------------------------------------------------------------
     Time and ids
     ------------------------------------------------------------------------- */
  PP.now = function () { return new Date().toISOString(); };

  PP.randomId = function (prefix) {
    var bytes = new Uint8Array(8);
    if (root.crypto && root.crypto.getRandomValues) {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var hex = '';
    for (var j = 0; j < bytes.length; j++) hex += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
    return prefix + '_' + hex;
  };

  /* ---------------------------------------------------------------------------
     Link parameters (?dc=...&t=...&round=...&lang=...&mock=1)
     ------------------------------------------------------------------------- */
  PP.params = function () {
    var out = {};
    try {
      var sp = new URLSearchParams(root.location.search);
      sp.forEach(function (value, key) { out[key] = String(value).trim(); });
    } catch (e) { /* very old browser: behave as if there were no parameters */ }
    return out;
  };

  /* ---------------------------------------------------------------------------
     PP.h(tag, attributes, children): build a page element.
       PP.h('button', { class: 'btn', type: 'button', on: { click: fn } }, 'Next')
     - text:  sets the visible text (always safe: never interpreted as HTML)
     - on:    event handlers
     - true / false / null values: attribute present / left out
     We deliberately offer NO way to inject raw HTML, so text coming from the
     config or the backend can never run code in the page.
     ------------------------------------------------------------------------- */
  PP.h = function (tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        var val = attrs[name];
        if (val === null || val === undefined || val === false) return;
        if (name === 'class') el.className = val;
        else if (name === 'text') el.textContent = val;
        else if (name === 'on') {
          Object.keys(val).forEach(function (evt) { el.addEventListener(evt, val[evt]); });
        } else if (val === true) el.setAttribute(name, '');
        else el.setAttribute(name, String(val));
      });
    }
    appendChildren(el, children);
    return el;
  };

  function appendChildren(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { appendChildren(el, c); });
    } else if (typeof children === 'string' || typeof children === 'number') {
      el.appendChild(document.createTextNode(String(children)));
    } else {
      el.appendChild(children);
    }
  }

  /* Remove everything inside an element. */
  PP.clear = function (el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  };

  /* ---------------------------------------------------------------------------
     Icons: Material Design icon shapes (Apache License 2.0), drawn as SVG.
     ------------------------------------------------------------------------- */
  var ICONS = {
    speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    stop: 'M6 6h12v12H6z',
    mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z',
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    checkCircle: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    warn: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    globe: 'M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z',
    keyboard: 'M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
  };

  PP.icon = function (name, extraClass) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICONS[name] || '');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  };

  /* ---------------------------------------------------------------------------
     Words in six languages (web/i18n/strings.json)

     Rules:
     - A text that still starts with "[TRANSLATE]" is a placeholder: the partner
       sees the fallback-language (English) text instead, WITHOUT the tag.
     - A missing key shows the key itself (e.g. "q.nps") so mistakes are visible
       during testing, and a warning appears in the browser console.
     - {s} and {n} inside a text are replaced with numbers by the code.
     ------------------------------------------------------------------------- */
  var TRANSLATE_TAG = /^\s*\[TRANSLATE\]\s*/;

  PP.i18n = {
    strings: {},
    languages: [],
    lang: 'en',
    fallback: 'en',
    _warned: {},

    init: function (strings, languages, fallback) {
      this.strings = strings || {};
      this.languages = languages || [];
      this.fallback = fallback || 'en';
    },

    setLang: function (code) { this.lang = code; },

    language: function (code) {
      for (var i = 0; i < this.languages.length; i++) {
        if (this.languages[i].code === code) return this.languages[i];
      }
      return null;
    },

    /* BCP-47 tag (e.g. "hi-IN") for a language code (e.g. "hi"). */
    bcp47: function (code) {
      var L = this.language(code);
      return (L && L.bcp47) || code;
    },

    /* True when a value needs the fallback language (missing, empty or [TRANSLATE]). */
    needsFallback: function (value) {
      return typeof value !== 'string' || !value.trim() || TRANSLATE_TAG.test(value);
    },

    /* Pick the best text from an object like {en: "...", hi: "...", ...}.
       Returns { text, lang, fallback } where lang is the language the text is
       really in (used by the read-aloud voice). */
    pick: function (entry, vars) {
      var lang = this.lang;
      var text = entry ? entry[lang] : null;
      var fallback = false;
      if (this.needsFallback(text)) {
        fallback = true;
        if (entry && !this.needsFallback(entry[this.fallback])) {
          lang = this.fallback;
          text = entry[this.fallback];
        } else {
          // Last resort: show the placeholder's English without the tag.
          text = String((entry && (entry[this.lang] || entry[this.fallback])) || '');
          lang = this.fallback;
        }
      }
      text = String(text).replace(TRANSLATE_TAG, '');
      if (vars) {
        Object.keys(vars).forEach(function (name) {
          text = text.split('{' + name + '}').join(String(vars[name]));
        });
      }
      return { text: text, lang: lang, fallback: fallback };
    },

    /* Look up a key. Returns { text, lang, fallback }. */
    info: function (key, vars) {
      var entry = this.strings[key];
      if (!entry || typeof entry !== 'object') {
        if (!this._warned[key]) {
          this._warned[key] = true;
          if (root.console) console.warn('[Partner Pulse] Missing text for key "' + key + '" in web/i18n/strings.json');
        }
        return { text: key, lang: this.fallback, fallback: true };
      }
      return this.pick(entry, vars);
    },

    t: function (key, vars) { return this.info(key, vars).text; },

    /* How many texts are still untranslated (missing or [TRANSLATE]) for a language. */
    untranslatedCount: function (code) {
      var self = this;
      var n = 0;
      Object.keys(this.strings).forEach(function (key) {
        if (key.charAt(0) === '_') return;
        var entry = self.strings[key];
        if (entry && typeof entry === 'object' && self.needsFallback(entry[code])) n++;
      });
      return n;
    }
  };

  /* Short form used everywhere: PP.t('ui.next') -> "Next" / "आगे" ... */
  PP.t = function (key, vars) { return PP.i18n.t(key, vars); };

}(typeof window !== 'undefined' ? window : globalThis));
