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
   - net.postJSON(body)     : send a message and read the JSON reply (with a time
                              limit that grows with the size of the message)
   - net.beacon(body)       : fire-and-forget message that survives the page closing
                              (used for pings, and for small answer sets when the
                              partner closes the page while they are being sent)
   - net.loadWhatsChanged() : content for the "What changed" screen: asks the
                              backend first, falls back to config/whats_changed.json
   - net.getJSON(url)       : load a config file

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

  /* GET a JSON file or URL. */
  net.getJSON = function (url, timeoutMs, cacheMode) {
    return net.fetchWithTimeout(url, { method: 'GET', credentials: 'omit', cache: cacheMode || 'no-cache' }, timeoutMs || 20000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
  };

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

  /* Content for the "What changed since your last feedback" screen.
     Always resolves (never fails): { title: null | {en:..}, items: [ {en:..}, ... ] } */
  net.loadWhatsChanged = function (round, timeoutMs) {
    var empty = { title: null, items: [] };
    var clean = function (block) {
      if (!block || !Array.isArray(block.items)) return null;
      return { title: block.title || null, items: block.items.filter(function (it) { return it && typeof it === 'object'; }) };
    };
    var fromFile = function () {
      return net.getJSON('config/whats_changed.json', timeoutMs).then(function (file) {
        return clean(file && file.rounds && file.rounds[round]) || empty;
      }, function () { return empty; });
    };
    if (!net.endpoint) return fromFile();
    var url = net.endpoint + (net.endpoint.indexOf('?') === -1 ? '?' : '&') +
      'action=whats_changed&round=' + encodeURIComponent(round);
    return net.getJSON(url, timeoutMs, 'no-store').then(function (res) {
      var block = res && res.ok ? clean(res) : null;
      return block || fromFile();
    }, fromFile);
  };

}(typeof window !== 'undefined' ? window : globalThis));
