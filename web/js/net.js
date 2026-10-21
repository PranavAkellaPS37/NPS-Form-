/* =============================================================================
   net.js: everything that talks to the backend (the mock server on this Mac
   in test mode, Google Apps Script in live mode). The message formats are in
   docs/submission-format.md.

   WHY "text/plain"?
   Answers are JSON, but we send them labelled as plain text. For plain-text
   POSTs the browser sends the request directly. For "application/json" it
   would first send a permission check (a CORS "preflight"), which Google Apps
   Script cannot answer, so the answers would be blocked. The server simply
   reads the text as JSON.

   WHAT IS IN HERE
   - net.bootstrap(round, draft, ms, previewKey)
                            : ONE request (GET ?action=bootstrap&round=..) that
                              asks the backend for the PUBLISHED questionnaire:
                              questions, texts, "what changed" for this round,
                              read-aloud clips, and the round's status (open,
                              closed, or draft = not open yet). With draft = true
                              (preview) it asks for the admins' unpublished draft
                              instead (&draft=1), and sends previewKey, the
                              private preview key from the preview link, as
                              &pk=...: the live backend hands out the draft only
                              with the right key.
                              Never fails: it gives null when the backend is slow
                              (more than ms milliseconds), down, says nothing is
                              published yet, refuses the preview key, or sends
                              something unusable (and at once when no backend
                              address is set). app.js then uses the form's own
                              copy (web/config, web/i18n).
   - net.postJSON(body)     : send a message and read the JSON reply (with a time
                              limit that grows with the size of the message)
   - net.beacon(body)       : fire-and-forget message that survives the page closing
                              (used for pings, and for small answer sets when the
                              partner closes the page while they are being sent)
   - net.loadStaticWhatsChanged(round, ms)
                            : the form's own copy of the "What changed" content
                              (config/whats_changed.json). Only used when the
                              bootstrap did not work.
   - net.cleanWhatsChanged(block): tidies one round's "What changed" block
   - net.getJSON(url)       : load a config file

   WHAT IT SENDS: only what docs/submission-format.md describes. It never
   sends cookies (credentials: "omit"), so a partner's Google login is never
   involved.

   MEESHO-ONLY MODE (21 Oct 2026): while the web app is open only to people
   signed in with a company account, the web app serves this page itself
   (Code.gs, PP_formPage_) and sets window.PP_EMBED. The bootstrap, pings and
   submissions then go through google.script.run (ppFormRequest on the
   server), Google's own channel for its pages, which carries the colleague's
   login; the form's own files still come from its GitHub Pages address
   (PP.assetUrl). Nothing else changes.

   Retrying failed submissions (with growing waits) is handled in app.js.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var net = PP.net = {
    endpoint: '', // set by app.js: mock server "/api" or the Apps Script ".../exec" URL
    mode: 'mock'
  };

  /* fetch() with a time limit, so a dead connection does not hang forever. */
  net.fetchWithTimeout = function (url, options, timeoutMs) {
    var opts = Object.assign({}, options);
    var controller = root.AbortController ? new AbortController() : null;
    if (controller) opts.signal = controller.signal;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, timeoutMs);
      fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        resolve(res);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  };

  /* True when the web app served this page (Meesho-only mode, see above). */
  net.embedded = function () {
    return Boolean(root.PP_EMBED && root.google && root.google.script && root.google.script.run);
  };

  /* Asks the script (ppFormRequest) through google.script.run. Errors and
     timeouts are retryable, like a failed fetch. */
  function scriptCall(kind, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var fail = function (text) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var err = new Error(text);
        err.retryable = true;
        reject(err);
      };
      var timer = setTimeout(function () { fail('timeout'); }, timeoutMs || 90000);
      root.google.script.run
        .withSuccessHandler(function (answer) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(answer);
        })
        .withFailureHandler(function (error) { fail(String((error && error.message) || error)); })
        .ppFormRequest(kind, payload);
    });
  }

  /* GET a JSON file or URL (one of the form's own files: see PP.assetUrl). */
  net.getJSON = function (url, timeoutMs, cacheMode) {
    return net.fetchWithTimeout(PP.assetUrl(url), { method: 'GET', credentials: 'omit', cache: cacheMode || 'no-cache' }, timeoutMs || 20000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
  };

  /* ---------------------------------------------------------------------------
     The published questionnaire ("bootstrap", docs/submission-format.md).
     The time limit covers the WHOLE download, not just the first byte: on
     slow data a 50 KB answer that has started but crawls along must not keep
     the partner waiting, because the form's own copy works just as well.
     ------------------------------------------------------------------------- */
  net.bootstrap = function (round, draft, timeoutMs, previewKey) {
    if (net.embedded()) {
      return scriptCall('bootstrap', { round: round, draft: draft ? '1' : '', pk: previewKey || '' }, timeoutMs)
        .then(function (answer) {
          if (usableBootstrap(answer)) return answer;
          if (root.console && answer && answer.error) {
            console.warn('[Partner Pulse] The backend has no questionnaire for us (' + answer.error +
              '); using the copy in the form instead.');
          }
          return null;
        }, function () { return null; });
    }
    if (!net.endpoint) return Promise.resolve(null);
    var url = net.endpoint + (net.endpoint.indexOf('?') === -1 ? '?' : '&') +
      'action=bootstrap&round=' + encodeURIComponent(round) +
      (draft ? '&draft=1&pk=' + encodeURIComponent(previewKey || '') : '');
    var controller = root.AbortController ? new AbortController() : null;
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      var timer = setTimeout(function () {
        if (controller) controller.abort(); // stop downloading: the form's own copy is used instead
        finish(null);
      }, timeoutMs);
      var opts = { method: 'GET', credentials: 'omit', cache: 'no-store' };
      if (controller) opts.signal = controller.signal;
      fetch(url, opts).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (answer) {
        if (usableBootstrap(answer)) {
          finish(answer);
        } else {
          if (root.console && answer && answer.error) {
            console.warn('[Partner Pulse] The backend has no questionnaire for us (' + answer.error +
              '); using the copy in the form instead.');
          }
          finish(null);
        }
      }, function () { finish(null); });
    });
  };

  /* Only use an answer that really contains a questionnaire. Anything else
     (an error such as "not_published", a Google error page, a half-broken
     answer) means: use the form's own copy. */
  function usableBootstrap(answer) {
    if (!answer || answer.ok !== true) return false;
    var survey = answer.survey;
    var strings = answer.strings;
    return Boolean(survey && typeof survey === 'object' &&
      Array.isArray(survey.flow) && survey.flow.length &&
      Array.isArray(survey.languages) && survey.languages.length &&
      strings && typeof strings === 'object' && !Array.isArray(strings));
  }

  /* POST a message as text/plain and read the JSON reply.
     timeoutMs = the normal time limit. Big messages (voice notes on slow data)
     get more time: at least 30 s plus the time to upload them at
     minBytesPerSecond, so a slow but working upload is never cut off.
     Network errors, timeouts, non-200 replies and unreadable replies are all
     thrown as errors with .retryable = true (app.js will try again later). */
  net.postJSON = function (body, timeoutMs, minBytesPerSecond) {
    var data = JSON.stringify(body);
    var limit = timeoutMs || 90000;
    if (minBytesPerSecond > 0) limit = Math.max(limit, 30000 + Math.ceil(data.length / minBytesPerSecond) * 1000);
    if (net.embedded()) {
      return scriptCall('post', data, limit).then(function (answer) {
        if (answer && typeof answer === 'object') return answer;
        var badErr = new Error('The server reply was not JSON');
        badErr.retryable = true;
        throw badErr;
      });
    }
    return net.fetchWithTimeout(net.endpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: data
    }, limit).then(function (res) {
      if (!res.ok) {
        var httpErr = new Error('HTTP ' + res.status);
        httpErr.retryable = true;
        throw httpErr;
      }
      return res.text();
    }).then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        var parseErr = new Error('The server reply was not JSON');
        parseErr.retryable = true;
        throw parseErr;
      }
    });
  };

  /* Fire-and-forget. sendBeacon keeps working while the page is closing
     (browsers accept up to about 64 KB this way). Returns true if handed over. */
  net.beaconText = function (data) {
    if (net.embedded()) {
      // Best effort: Google's channel may not finish once the page closes;
      // anything unsent goes the next time the link is opened.
      scriptCall('post', data, 30000).then(null, function () { /* nothing to do */ });
      return true;
    }
    if (!net.endpoint) return false;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(net.endpoint, data)) return true;
    } catch (e) { /* fall through to fetch */ }
    try {
      fetch(net.endpoint, {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: data
      }).catch(function () { /* nothing to do: best effort */ });
      return true;
    } catch (e2) {
      return false;
    }
  };

  net.beacon = function (body) { return net.beaconText(JSON.stringify(body)); };

  /* One round's "What changed" block, tidied: { title: null | {en:..}, items: [ {en:..}, ... ] }.
     Returns null when the block is missing or not shaped like that. */
  net.cleanWhatsChanged = function (block) {
    if (!block || !Array.isArray(block.items)) return null;
    return { title: block.title || null, items: block.items.filter(function (it) { return it && typeof it === 'object'; }) };
  };

  /* The form's own copy of the "What changed" content (config/whats_changed.json),
     used only when the published questionnaire did not arrive.
     Always resolves (never fails); an unknown round gives no items. */
  net.loadStaticWhatsChanged = function (round, timeoutMs) {
    var empty = { title: null, items: [] };
    return net.getJSON('config/whats_changed.json', timeoutMs).then(function (file) {
      return net.cleanWhatsChanged(file && file.rounds && file.rounds[round]) || empty;
    }, function () { return empty; });
  };

}(typeof window !== 'undefined' ? window : globalThis));
