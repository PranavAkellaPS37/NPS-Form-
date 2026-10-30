/* =============================================================================
   app.js: starts the form and moves between screens.

   WHAT HAPPENS WHEN A PARTNER OPENS THE LINK
   1. Load only the form's own settings file, config/survey.json (it comes
      with the form, from GitHub Pages, and says where the backend is). The
      form's own copy of the texts, i18n/strings.json, is NOT loaded here: it
      is downloaded only if step 2 gets no usable answer. If the form cannot
      start (for example a file it needs does not load on bad data), a short
      "tap to retry" message is shown in English + Hindi.
   2. Ask the backend for the PUBLISHED questionnaire, in one request (the
      "bootstrap", docs/submission-format.md section 4). Its answer also says
      whether the survey round is open, closed, or not open yet (draft).
      It is only asked when the link is complete (step 3): an incomplete
      link only gets the "This link is incomplete" message. The form waits
      at most whats_changed.timeout_seconds + 2 seconds (that setting is read
      from the form's own copy); a preview waits 20 seconds instead (or
      timeout_seconds + 2, if that is longer).
      - Answer received: the published questions, texts, "What changed" items
        and read-aloud clips are used, and the colours are applied again.
        Where answers are sent (backend.mode, backend.mock_url,
        backend.apps_script_url) and the test-link defaults ("links") always
        stay as in the form's own copy: the form needs them before it can ask.
      - No answer in time, an error (a refused preview key too), nothing
        published yet, or an unusable answer: only now is i18n/strings.json
        downloaded (so a phone never downloads the texts twice), and the
        form's own copy is used, with config/whats_changed.json and
        config/audio_clips.json. The round's status is then "unknown" and the
        survey carries on.
      - An answer that breaks the form while it starts (a mistake the checks
        missed): the form's own copy is used instead, the same way.
      This one request replaces Phase 1's separate "what changed" request.
   3. Read the link: ?dc=<DC id>&t=<token>&round=<round id>&lang=..&mock=1
      - live mode: a link without dc / t / round shows "This link is incomplete"
      - test mode (?mock=1, or backend.mode = "mock"): missing values come from
        links.mock_defaults, so http://localhost:8787/ just works
      (The link is read before step 2, because the bootstrap needs the round
      and is only asked for a complete link. Every other part of steps 3 and
      4 runs after step 2, because the published questionnaire may have a
      different list of languages.)
   4. Restore saved progress for this DC + round on this phone, so closing the
      page and opening the link again continues where the partner left off.
   5. Round check (docs/control-panel-design.md section 15, item 2):
      - draft round  -> "This survey is not open yet"
      - closed round -> "This survey has closed", EXCEPT for a partner who
        already started on this phone, or finished but whose answers were not
        sent yet: they may finish, and the backend marks the answers as late
      - open or unknown -> carry on
   6. Show the right screen and send an "opened" ping (which also checks the
      token). If the backend answers "round_not_open", "not open yet" is shown.
      If the bootstrap did not arrive (status unknown) and the ping says the
      round is closed, a partner who has not started yet sees "has closed".

   PREVIEW LINKS (?preview=1&round=<round>&pk=<preview key>, made by the
   control panel)
   - Show the admins' DRAFT questionnaire (the bootstrap asks with draft=1
     and the link's private preview key, pk), so changes can be checked
     before they are published. If the draft does not arrive (or the key is
     refused), the form's own copy is shown and the PREVIEW strip says so. A
     preview link without a round is incomplete: no draft is asked for. A
     draft that arrives but breaks the form gets its own strip text
     (dev.preview_broken: don't publish it).
     Any round can be previewed, also a draft round: there is no round check.
   - A "PREVIEW: answers are not saved" strip is shown, also in live mode.
   - NOTHING is sent: no pings and no answers. Progress is kept on the phone
     under its own name (state:preview:<round>:<dc>), never mixed with a real
     link's, and the "last used language" of real links is left alone.
   - dc and t are optional (dc defaults to DC-PREVIEW); the round is required.
   - The last screen says "Preview finished. Nothing was saved." with a
     "Start again" button (forgets the preview's answers and reloads, which
     also fetches the latest draft).

   MOVING AROUND
   - Next, automatic "next" after a single tap, the Back button, and the
     phone's own back button (one browser-history entry per screen).
   - Every screen view is recorded in state.events (screen id + time) so the
     dashboard can show where partners drop off.
   - flow.js decides the screens after every answer, from the "flow" (a
     list, or a graph with jumps, loops and endings: docs/flow-engine.md).
     Rules see only answers on the partner's CURRENT route: an answer left
     behind by going Back and changing an earlier one stays on the phone but
     is never tested or sent. Reaching an ending (a thank-you) sends.
   - A screen can drop off the route while it is on show (a rule on the
     language, after the partner switches language with the button at the
     top). Next then goes on where a resumed visit would (the first screen
     not seen yet or not complete) and Back to the screen before that: never
     back to the start (place()).
   - A questionnaire whose route goes straight to an ending before anything
     is answered has nothing to ask: like one that breaks the form, the
     form's own copy is used instead (checkRoute()).
   - The checks BEFORE the questionnaire (link, round status, already sent,
     resume) stay here on purpose: no questionnaire edit can switch them off.

   SENDING (see docs/submission-format.md)
   - After the last question the thank-you screen sends the answers.
   - If sending fails: automatic retries after backend.retry_delays_seconds, a
     "Send now" button, another try when the internet comes back, and another
     the next time the link is opened. Every try reuses the same submission_id,
     so the backend never stores the same answers twice.
   - Every try sends the answers exactly as they were when the partner
     finished (state.sent_copy, kept from the first try on), even when a
     later visit loaded another questionnaire (a newer published version, or
     the form's own copy because Google was slow): building them again from
     that one could drop answers and stamp the wrong version (30 Oct 2026).
   - "round_not_open" from the backend (the round is a draft): "not open yet"
     is shown and nothing more is sent during this visit (no retries). The
     answers stay on the phone and go the next time the link is opened, once
     the round is open.
   - After a successful send, the answers and voice notes are deleted from the
     phone; only a small "already sent" marker is kept.
   - If the partner closes the page while sending, small answer sets are handed
     to the browser to deliver anyway (sendBeacon); big ones are sent the next
     time the link is opened.

   SAFEGUARDS
   - Taps on answers / Next / Skip that land within half a second of a new
     screen appearing are ignored, so a double tap on a slow phone never
     answers (or submits) the next screen by accident.
   - A link the server rejected stays blocked only while it is the same link;
     a corrected link, or the server accepting it again, unlocks it.
   - If another tab already sent this link's answers, this tab never undoes it.
   - A questionnaire whose areas or support items are not a list is broken:
     a published one falls back to the form's own copy (checkLists).

   DEVELOPER DRAWER: in test mode only, &simulate=1 loads
   scripts/dev/simulate.js from the local test server (never part of web/);
   it sees the form through PP.dev (loadSimulator).

   You do not need to edit this file to change the questionnaire: use the
   control panel (Google Sheet), or web/config + web/i18n for the form's own copy.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP;
  var t = PP.t;
  var h = PP.h;

  var APP_VERSION = '0.3.3';
  var SAFE_ID = /^[A-Za-z0-9_.-]{1,64}$/; // allowed characters in DC ids and round ids
  var TOKEN = /^[A-Za-z0-9_-]{8,128}$/;    // shape of a link token
  var MAX_EVENTS = 300;
  var GUARD_MS = 500;           // ignore taps this soon after a screen appears
  var MAX_BEACON_CHARS = 50000; // answer sets small enough to send while the page closes
  var PREVIEW_DC = 'DC-PREVIEW'; // the pretend DC of a preview link without dc=
  var ROUND_STATUSES = ['draft', 'open', 'closed', 'unknown'];
  // End screens of a visit where no survey could be taken: no progress bar
  // (a full bar would wrongly suggest "you finished").
  var NO_PROGRESS_BAR = ['closed', 'not_open', 'incomplete', 'bad_link'];

  var config = null;     // the questionnaire in use: the published one, or the form's own copy
  var published = null;  // what only the published questionnaire brings: { wc, clips } (null = own copy in use)
  var preview = false;   // ?preview=1: the admins' draft; nothing is ever sent
  var previewFallback = false; // preview, but the draft did not arrive: showing the form's own copy
  var draftBroken = false;     // preview: the draft arrived but breaks the form, so the form's own copy is shown
  var PREVIEW_WAIT_MS = 20000;   // how long a preview waits for the draft
  var STALE_DAYS = 30;           // unfinished answers untouched this long are deleted from the phone
  var roundStatus = 'unknown'; // draft | open | closed | unknown (from the bootstrap)
  var visitEnded = false; // the round is closed / not open: this visit only shows that message, sends nothing
  var state = null;      // everything saved on the phone for this DC + round
  var ns = '';           // storage name for this link: "<round>:<dc>" ("preview:<round>:<dc>" in preview)
  var link = { dc: '', t: '', round: '' };
  var mode = 'mock';     // "mock" (test server on the Mac) or "live" (Apps Script)
  var langInUrl = false;
  var wc = { title: null, items: [] };
  var steps = [];        // the screens on this partner's path (see flow.js)
  var current = null;    // the step on screen
  var screen = null;     // what its drawing returned (PP.screens: web/js/types.js and js/types/, built with ui.js)
  var cleanups = [];
  var advanceTimer = null;
  var saveTimer = null;
  var noticeTimer = null;
  var toastTimer = null;
  var navDepth = 0;      // how many history entries we added (for the back button)
  var collapsingHistory = false;
  var openSheet = null;  // the sheet on show (help videos, languages): { close, entry }
  var ownSteps = 0;      // the form's own history.back() steps still to arrive (stepBack): not Back presses
  var finishedHere = false; // the partner finished during this visit (so `config` is the questionnaire they answered)
  var resumed = false;
  var offlineShown = false;
  var lastProgressPing = 0;
  var shownAt = 0;       // when the current screen appeared (for the double-tap guard)
  var sentElsewhere = false;
  var submit = { status: 'idle', retryIn: 0, retryAt: 0, timer: null, tick: null, inFlight: false, sessionTries: 0 };
  var el = {};
  var eventsBound = false; // bindEvents() ran (setup() can run twice: see prepare())
  var listsChecked = null; // the questionnaire checkLists() accepted
  var simulate = false;    // ?simulate=1 (test mode): the developer drawer

  /* ---------------------------------------------------------------------------
     Start-up, step 1: the form's own copy of the questionnaire
     ------------------------------------------------------------------------- */
  function boot() {
    el = {
      devBanner: document.getElementById('dev-banner'),
      brand: document.getElementById('brand'),
      langBtn: document.getElementById('lang-btn'),
      helpBtn: document.getElementById('help-btn'),
      progress: document.getElementById('progress'),
      progressFill: document.getElementById('progress-fill'),
      notice: document.getElementById('notice'),
      toast: document.getElementById('toast'),
      screen: document.getElementById('screen'),
      navbar: document.getElementById('navbar'),
      back: document.getElementById('nav-back'),
      skip: document.getElementById('nav-skip'),
      next: document.getElementById('nav-next')
    };
    try { root.history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }

    var params = PP.params();
    // Only the small settings file first: it says where the backend is. The
    // texts come with the published questionnaire; the form's own copy of the
    // texts (i18n/strings.json) is downloaded only if that does not arrive, so
    // partners on slow data never download the questionnaire twice.
    PP.net.getJSON('config/survey.json', 20000).then(function (ownCfg) {
      return prepare(ownCfg, params);
    }).catch(bootFailed);
  }

  function bootFailed(err) {
    if (root.console) console.error('[Partner Pulse] Could not start:', err);
    showBootError();
  }

  /* ---------------------------------------------------------------------------
     Start-up, step 2: ask the backend for the published questionnaire
     ------------------------------------------------------------------------- */
  function prepare(ownCfg, params) {
    preview = params.preview === '1';
    simulate = params.simulate === '1';
    config = ownCfg;
    applyBranding(); // the form's own colours while waiting
    chooseBackend(ownCfg, params);
    link = readLink(ownCfg, params);

    // An incomplete link only gets the "link incomplete" message: no need to
    // ask for the questionnaire. A preview link carries the panel's private
    // preview key (&pk=...).
    var asked = linkComplete();
    var asking = asked ?
      PP.net.bootstrap(link.round, preview, bootstrapWaitMs(ownCfg), params.pk || '') : Promise.resolve(null);
    // No published questionnaire (offline, Google slow, nothing published yet,
    // or a preview key that was refused): use the form's own copy.
    var useOwnCopy = function () {
      return PP.net.getJSON('i18n/strings.json', 20000).then(function (ownStrings) {
        useQuestionnaire(ownCfg, ownStrings);
        // "Could not load the draft" only if one was asked for and did not arrive
        previewFallback = preview && asked && !draftBroken;
        return setup(params); // an unexpected error ends in the "tap to retry" message, never an endless spinner
      });
    };
    // A failed attempt may already have saved this link's progress on the
    // phone (a screen view): the second attempt starts from what was saved
    // before it, so nothing is counted twice.
    var stateKey = 'state:' + (preview ? 'preview:' : '') + link.round + ':' + link.dc;
    var savedBefore = PP.store.get(stateKey);
    return asking.then(function (answer) {
      if (!answer) return useOwnCopy();
      return Promise.resolve().then(function () {
        usePublished(ownCfg, answer);
        return setup(params);
      }).catch(function (err) {
        // The published questionnaire breaks the form (for example a mistake
        // the checks missed): partners still get the form's own copy. In a
        // preview the strip says the draft itself is broken (dev.preview_broken).
        if (root.console) console.error('[Partner Pulse] The published questionnaire could not be shown; using the form\'s own copy instead:', err);
        if (savedBefore) PP.store.set(stateKey, savedBefore);
        else PP.store.remove(stateKey);
        published = null;
        state = null;
        steps = [];
        current = null;
        screen = null;
        resumed = false;
        draftBroken = preview;
        return useOwnCopy();
      });
    });
  }

  /* dc, round and (live) token are usable. A preview never sends anything,
     so it needs no token; test mode fills in its own. */
  function linkComplete() {
    return SAFE_ID.test(link.dc) && SAFE_ID.test(link.round) &&
      (preview || mode === 'mock' || TOKEN.test(link.t));
  }

  /* The questionnaire and texts to show from now on (i18n and colours too). */
  function useQuestionnaire(cfg, strings) {
    config = cfg;
    config.navigation = config.navigation || {};
    PP.i18n.init(strings, cfg.languages, cfg.fallback_language || cfg.default_language || 'en');
    applyBranding();
  }

  /* Test (mock) mode or live mode, and where to send answers. Always decided
     by the form's own copy: the published questionnaire never changes it. */
  function chooseBackend(ownCfg, params) {
    var backend = ownCfg.backend || {};
    if (PP.net.embedded()) {
      // Meesho-only mode: the web app served this page, and answers go to it
      // through google.script.run (net.js), whatever the form's own copy says.
      mode = 'live';
      PP.net.mode = mode;
      PP.net.endpoint = 'google.script.run';
      return;
    }
    mode = params.mock === '1' ? 'mock' : (backend.mode === 'apps_script' ? 'live' : 'mock');
    PP.net.mode = mode;
    PP.net.endpoint = mode === 'mock' ? absoluteUrl(backend.mock_url || '/api') : (backend.apps_script_url || '');
    if (mode === 'live' && !PP.net.endpoint && root.console) {
      console.error('[Partner Pulse] backend.apps_script_url is empty in config/survey.json');
    }
  }

  /* dc, t and round from the link (checked later, in setup).
     Test mode fills in missing values from links.mock_defaults. A preview
     needs only the round: dc defaults to DC-PREVIEW and no token is needed,
     because a preview never sends anything. */
  function readLink(ownCfg, params) {
    if (preview) return { dc: params.dc || PREVIEW_DC, t: params.t || '', round: params.round || '' };
    var defaults = (mode === 'mock' && ownCfg.links && ownCfg.links.mock_defaults) || {};
    return {
      dc: params.dc || defaults.dc || '',
      t: params.t || defaults.t || '',
      round: params.round || defaults.round || ''
    };
  }

  /* How long to wait for the published questionnaire before using the form's
     own copy: whats_changed.timeout_seconds + 2 seconds. */
  function bootstrapWaitMs(ownCfg) {
    var s = Number(ownCfg.whats_changed && ownCfg.whats_changed.timeout_seconds);
    var ms = ((s > 0 ? s : 4) + 2) * 1000;
    // A preview compiles the draft on the spot, which can take Google longer.
    return preview ? Math.max(ms, PREVIEW_WAIT_MS) : ms;
  }

  /* The backend sent the published (or, in preview, the draft) questionnaire. */
  function usePublished(ownCfg, answer) {
    var cfg = answer.survey;
    // Where answers go and the test-link defaults stay as in the form's own
    // copy (docs/control-panel-design.md section 5: they are never in the Sheet).
    var ownBackend = ownCfg.backend || {};
    cfg.backend = Object.assign({}, cfg.backend);
    ['mode', 'mock_url', 'apps_script_url'].forEach(function (key) {
      if (key in ownBackend) cfg.backend[key] = ownBackend[key];
      else delete cfg.backend[key];
    });
    if ('links' in ownCfg) cfg.links = ownCfg.links;
    else delete cfg.links;
    // Every ping and submission is stamped with the questionnaire really shown.
    cfg.config_version = cfg.config_version || answer.config_version || null;

    useQuestionnaire(cfg, answer.strings);
    published = {
      wc: PP.net.cleanWhatsChanged(answer.whats_changed) || { title: null, items: [] },
      clips: answer.clips && typeof answer.clips === 'object' ? answer.clips : {}
    };
    var status = answer.round && answer.round.status;
    roundStatus = ROUND_STATUSES.indexOf(status) !== -1 ? status : 'unknown';
  }

  /* ---------------------------------------------------------------------------
     Start-up, steps 3 to 6: link, language, saved progress, round check.
     Returns a promise when it still has to load something (so errors reach bootFailed).
     ------------------------------------------------------------------------- */
  function setup(params) {
    var cfg = config;
    var codes = (cfg.languages || []).map(function (L) { return L.code; });
    var urlLang = String(params.lang || '').toLowerCase();
    langInUrl = codes.indexOf(urlLang) !== -1;
    var storedLang = PP.store.get('lang');

    bindEvents();

    if (!linkComplete()) {
      setLang(langInUrl ? urlLang : (codes.indexOf(storedLang) !== -1 ? storedLang : cfg.default_language || 'en'), false);
      showTerminal('incomplete');
      return;
    }

    // Saved progress for this DC + round (a preview keeps its own, separate copy)
    ns = (preview ? 'preview:' : '') + link.round + ':' + link.dc;
    state = loadState();

    // Language: the partner's own choice > ?lang= in the link > last used > default
    var lang;
    if (state.lang_set_by_user && codes.indexOf(state.lang) !== -1) lang = state.lang;
    else if (langInUrl) lang = urlLang;
    else if (codes.indexOf(state.lang) !== -1) lang = state.lang;
    else if (codes.indexOf(storedLang) !== -1) lang = storedLang;
    else lang = cfg.default_language || codes[0] || 'en';
    setLang(lang, false);
    if (langInUrl) state.lang_chosen = true;

    // Read-aloud: pre-recorded clips come with the published questionnaire;
    // otherwise the optional config/audio_clips.json loads in the background.
    if (published) {
      PP.speech.init(cfg, { clips: published.clips });
    } else {
      PP.speech.init(cfg, null);
      PP.net.getJSON('config/audio_clips.json', 15000).then(PP.speech.setClips, function () { /* optional */ });
    }

    updateChrome();
    if (navigator.onLine === false) showOffline(true);

    if (roundCheckStops()) return;

    if (published) {
      wc = published.wc;
      start();
      return;
    }
    // The form's own copy: "what changed" from config/whats_changed.json
    // (only needed if that screen is in the flow)
    var empty = { title: null, items: [] };
    var needWc = !state.finished && !state.submitted && PP.flow.hasType(cfg, 'whats_changed');
    var waitMs = ((cfg.whats_changed && Number(cfg.whats_changed.timeout_seconds)) || 4) * 1000;
    var loading = needWc ? withTimeout(PP.net.loadStaticWhatsChanged(link.round, waitMs), waitMs + 2000, empty) : Promise.resolve(empty);
    return loading.then(function (data) {
      wc = data || empty;
      start();
    });
  }

  /* Step 5: may this visit go ahead in this round? Never checked in preview:
     admins may preview any round, also one that is not open yet.
     Returns true when the visit stops here (a message is shown instead). */
  function roundCheckStops() {
    if (preview) return false;
    if (roundStatus === 'draft') {
      endVisit('not_open');
      return true;
    }
    if (roundStatus === 'closed' && !mayFinishLate()) {
      endVisit('closed');
      return true;
    }
    return false;
  }

  /* A closed round still takes answers from a partner who already started on
     this phone, or who finished but whose answers were not sent yet. */
  function mayFinishLate() {
    return hasProgress() || Boolean(state && state.finished && !state.submitted);
  }

  /* "This survey has closed" / "is not open yet": the visit shows only that
     message and sends nothing more (no pings, no retries). Anything saved on
     the phone stays there for the next visit. */
  function endVisit(status) {
    visitEnded = true;
    showTerminal(status);
  }

  function start() {
    // A link rejected earlier, but this link has a different token (for example
    // a corrected link sent by ops): forget the old rejection.
    if (state.bad_link && state.bad_token !== link.t) {
      state.bad_link = false;
      state.bad_token = null;
      save();
    }
    pruneMissingAudio();
    if (!state.submitted) checkRoute();
    showInitialScreen();
    pingOpened();
    loadSimulator();
  }

  /* A questionnaire whose route goes straight to an ending before anything
     was answered (for example a published graph whose every screen is
     skipped) has nothing to ask: it would only say thank you and send an
     empty answer. Like a questionnaire that breaks the form, it is not used:
     the error lets prepare() show the form's own copy instead (in a preview:
     "the draft is broken"). */
  function checkRoute() {
    rebuildSteps();
    if (steps.length && PP.flow.isEnd(steps[0]) && !hasProgress()) {
      throw new Error('The questionnaire\'s route goes straight to an ending: it has nothing to ask');
    }
  }

  function showInitialScreen() {
    if (state.submitted) {
      showTerminal('already');
    } else if (state.finished) {
      // Finished earlier but the answers never reached the server: try again now.
      // (Also after a "not valid" answer: the server checks the token again.)
      // A finished preview just shows "Preview finished" again.
      rebuildSteps();
      showThanks();
      trySubmit();
    } else if (state.bad_link) {
      showTerminal('bad_link'); // pingOpened() unlocks it if the server now accepts the link
    } else {
      rebuildSteps();
      showStep(resumeTarget(), 'replace');
      if (resumed && hasProgress()) showNotice(t('resume.notice'), 5000);
    }
  }

  /* Where to continue: the saved screen. If the questionnaire changed since and
     that screen is gone, the first screen on the new path that was never seen
     or is not answered yet (when that is the ending: the screen before it). */
  function resumeTarget() {
    if (state.current && PP.flow.indexOf(steps, state.current) !== -1) return state.current;
    var i = firstOpen();
    return steps[PP.flow.isEnd(steps[i]) ? Math.max(0, i - 1) : i].id;
  }

  /* The place on the route of the first screen the partner has not seen yet,
     or whose answer is not complete; the ending's place when every screen
     before it is done. */
  function firstOpen() {
    var seen = {};
    ((state && state.events) || []).forEach(function (ev) { seen[ev.screen] = true; });
    for (var i = 0; i < steps.length; i++) {
      if (PP.flow.isEnd(steps[i])) return i;
      if (!has(seen, steps[i].id) || !PP.flow.canProceed(steps[i], state, config)) return i;
    }
    return 0;
  }

  /* Where the screen on show sits on the route, as places in steps:
     { at (for the progress bar), back, next, off }. Normally its own place.
     A screen can drop off the route while it is on show: a rule on the
     partner's language, after they switch language with the button at the
     top. It then counts as sitting just before the first screen not seen yet
     or not complete: Next goes where resumeTarget() would, Back to the screen
     before that, and the history keeps working. Never back to the start. */
  function place() {
    var idx = current ? PP.flow.indexOf(steps, current.id) : -1;
    if (idx !== -1 || !current) return { at: Math.max(0, idx), back: idx - 1, next: idx + 1, off: false };
    var open = firstOpen();
    var next = PP.flow.isEnd(steps[open]) ? Math.max(0, open - 1) : open;   // = resumeTarget()
    return { at: Math.max(0, open - 0.5), back: open - 1, next: next, off: true };
  }

  /* A voice note whose recording could not be stored on the phone (storage
     full) is gone after a reload: forget it, so it no longer counts as an answer. */
  function pruneMissingAudio() {
    var changed = false;
    Object.keys(state.audio || {}).forEach(function (id) {
      if (!PP.voice.loadAudio(ns, id)) {
        delete state.audio[id];
        changed = true;
      }
    });
    if (changed) save();
  }

  function markBadLink() {
    state.bad_link = true;
    state.bad_token = link.t;
    save();
  }

  function newState() {
    return {
      v: 1,
      dc: link.dc,
      round: link.round,
      session_id: PP.randomId('ses'),
      opened_at: PP.now(),
      started_at: null,
      submitted_at: null,
      lang: null,
      lang_chosen: false,
      lang_set_by_user: false,
      answers: dict(),
      texts: dict(),
      audio: dict(),
      current: null,
      events: [],
      event_seq: 0,
      finished: false,
      submitted: false,
      submission_id: null,
      submit_attempts: 0,
      resume_count: 0,
      voice_consent: false,
      voice_denied: false,
      bad_link: false,
      bad_token: null
    };
  }

  function loadState() {
    var saved = PP.store.get('state:' + ns);
    if (!saved || saved.v !== 1 || saved.dc !== link.dc || saved.round !== link.round) return newState();
    // Phones are often shared: half-finished answers (typed complaints, voice
    // notes) left untouched for STALE_DAYS are deleted rather than kept forever.
    // Finished surveys still waiting to be sent are always kept.
    if (!saved.finished && !saved.submitted && isStale(saved.updated_at)) {
      PP.voice.dropAll(ns);
      PP.store.remove('state:' + ns);
      return newState();
    }
    saved.answers = dict(saved.answers);
    saved.texts = dict(saved.texts);
    saved.audio = dict(saved.audio);
    saved.events = saved.events || [];
    if (!saved.finished && !saved.submitted && saved.events.length) {
      saved.resume_count = (saved.resume_count || 0) + 1;
      resumed = true;
    }
    return saved;
  }

  function isStale(isoTime) {
    var t = Date.parse(isoTime || '');
    return t > 0 && Date.now() - t > STALE_DAYS * 24 * 3600 * 1000;
  }

  function hasProgress() {
    if (!state) return false;
    if (Object.keys(state.answers || {}).length || Object.keys(state.audio || {}).length) return true;
    var texts = state.texts || {};
    return Object.keys(texts).some(function (k) { return String(texts[k] || '').trim(); });
  }

  /* ---------------------------------------------------------------------------
     Saving
     ------------------------------------------------------------------------- */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state || !ns) return;
    if (!state.submitted) {
      // Another tab already sent this link's answers: never overwrite that
      // "sent" marker with this tab's older copy.
      var stored = PP.store.get('state:' + ns);
      if (stored && stored.submitted) {
        sentInAnotherTab(stored);
        return;
      }
    }
    state.updated_at = PP.now();
    PP.store.set('state:' + ns, state);
  }

  function sentInAnotherTab(stored) {
    if (sentElsewhere) return;
    sentElsewhere = true;
    state = stored;
    setTimeout(function () { showTerminal('already'); }, 0);
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  /* ---------------------------------------------------------------------------
     Moving between screens
     ------------------------------------------------------------------------- */
  /* What flow.js works the route out from: the answers saved on the phone
     and the facts rules may test (docs/flow-engine.md 2.3). */
  function flowContext() {
    return {
      state: state,
      langInUrl: langInUrl,
      whatsChangedCount: (wc && wc.items && wc.items.length) || 0,
      lang: PP.i18n.lang,
      round: link.round
    };
  }

  function rebuildSteps() {
    if (listsChecked !== config) {
      checkLists(config);
      listsChecked = config;
    }
    steps = PP.flow.buildSteps(config, flowContext());
  }

  /* The lists screens repeat over (areas, support items) must be lists. The
     old engine stopped on such a questionnaire; the new one would quietly
     drop those screens and their answers. Stopping here makes a broken
     published questionnaire fall back to the form's own copy, as before. */
  function checkLists(cfg) {
    var collections = PP.flow.load(cfg).collections || {};
    Object.keys(collections).forEach(function (name) {
      var spec = collections[name];
      var list = cfg;
      String((spec && spec.list) || '').split('.').forEach(function (part) {
        list = list !== null && typeof list === 'object' ? list[part] : undefined;
      });
      if (list && !Array.isArray(list)) {
        throw new Error('The questionnaire\'s "' + spec.list + '" is not a list');
      }
    });
  }

  function runCleanups() {
    var list = cleanups;
    cleanups = [];
    list.forEach(function (fn) {
      try { fn(); } catch (e) { if (root.console) console.error(e); }
    });
  }

  function recordView(screenId) {
    state.event_seq = (state.event_seq || 0) + 1;
    state.events.push({ seq: state.event_seq, screen: screenId, at: PP.now() });
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  }

  /* how: "push" (new history entry), "replace" (reuse the current one) or "none". */
  function showStep(id, how) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    runCleanups();
    PP.speech.stop();
    rebuildSteps();
    var idx = PP.flow.indexOf(steps, id);
    current = steps[idx === -1 ? 0 : idx];
    if (PP.flow.isEnd(current)) {
      showThanks(current);
      return;
    }
    state.current = current.id;
    recordView(current.id);
    if (how === 'push') {
      navDepth += 1;
      try { root.history.pushState({ pp: current.id, n: navDepth }, ''); } catch (e) { navDepth -= 1; }
    } else if (how === 'replace') {
      try { root.history.replaceState({ pp: current.id, n: navDepth }, ''); } catch (e) { /* ignore */ }
    }
    save();
    renderCurrent();
    focusTitle();
  }

  /* sameScreen = true when the same screen is only redrawn (e.g. new language):
     then the double-tap guard is not restarted, because nothing moved. */
  function renderCurrent(sameScreen) {
    hideToast();
    if (sameScreen !== true) shownAt = Date.now();
    var draw = has(PP.screens, current.type) ? PP.screens[current.type] : null;
    if (!draw) {
      if (root.console) console.error('[Partner Pulse] Unknown screen type "' + current.type + '" in config/survey.json');
      draw = PP.screens.info_card;
    }
    screen = draw(makeCtx());
    PP.clear(el.screen);
    el.screen.appendChild(screen.el);
    updateChrome();
    try { root.scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  /* Re-draw the same screen (e.g. after changing language). Not a new "view". */
  function redraw() {
    if (!current) return;
    runCleanups(); // stops a recording; it is saved, then shown on the new drawing
    PP.speech.stop();
    PP.voice.whenIdle().then(function () { renderCurrent(true); });
  }

  function makeCtx() {
    return {
      step: current,
      config: config,
      state: state || { answers: {}, texts: {}, audio: {} },
      wc: wc,
      mode: mode,
      preview: preview,
      ns: ns,
      submit: submit,
      setAnswer: setAnswer,
      refreshNav: updateNav,
      save: save,
      saveSoon: saveSoon,
      activity: markStarted,
      onCleanup: function (fn) { cleanups.push(fn); },
      chooseLanguage: chooseLanguage,
      retryNow: retryNow,
      startOver: startOver
    };
  }

  function focusTitle() {
    // The question title, or (thank-you screen while sending) the status box.
    var title = el.screen.querySelector('.q-title') || el.screen.querySelector('.final');
    if (!title) return;
    try { title.focus({ preventScroll: true }); } catch (e) { try { title.focus(); } catch (e2) { /* ignore */ } }
  }

  function setAnswer(id, value, advance) {
    state.answers[id] = value;
    markStarted();
    save();
    updateNav();
    if (advance && config.navigation.auto_advance !== false) scheduleAdvance();
  }

  function scheduleAdvance() {
    clearTimeout(advanceTimer);
    var stepId = current.id;
    advanceTimer = setTimeout(function () {
      advanceTimer = null;
      if (current && current.id === stepId) onNext();
    }, Number(config.navigation.auto_advance_delay_ms) || 350);
  }

  function onNext() {
    if (!current || !state) return;
    if (!PP.flow.canProceed(current, state, config)) {
      var msg = screen && screen.blockedHint ? screen.blockedHint() : t('ui.choose_one');
      showToast(msg);
      return;
    }
    goNext();
  }

  function goNext() {
    rebuildSteps();
    var p = place();
    var target = steps[p.next];
    if (!target) return;
    if (PP.flow.isEnd(target)) finish(target);
    // a screen that dropped off the route gives its history entry to the next one
    else showStep(target.id, p.off ? 'replace' : 'push');
  }

  function onBack() {
    if (!current || !state) return;
    if (navDepth > 0) {
      root.history.back(); // the "popstate" handler below does the rest
      return;
    }
    var p = place();
    if (p.back >= 0) showStep(steps[p.back].id, 'replace');
  }

  /* The phone's back (or forward) button. */
  function onPopState(e) {
    var s = (e && e.state) || {};
    if (ownSteps > 0) {   // one of the form's own steps back (stepBack): not a Back press
      ownSteps -= 1;
      return;
    }
    // An open sheet (help videos, languages) has a history entry of its own
    // (showSheet): Back closes the sheet, and the survey stays where it is.
    if (openSheet) {
      var hadEntry = openSheet.entry;
      openSheet.close(true);
      if (hadEntry) return;
    }
    var newDepth = typeof s.n === 'number' ? s.n : 0;
    if (newDepth === navDepth && !collapsingHistory) {
      // The same depth: a step between a sheet's entry and its screen's (for
      // example Forward onto a closed sheet's entry). Never a screen change;
      // a closed sheet's entry is left again.
      if (s.sheet) stepBack();
      return;
    }
    var forward = newDepth > navDepth;
    navDepth = newDepth;

    if (collapsingHistory) {
      // We just jumped back over the survey's history entries after finishing.
      collapsingHistory = false;
      navDepth = 0;
      var ending = current && PP.flow.isEnd(current) ? current.id : 'thanks';
      try { root.history.replaceState({ pp: ending, n: 0 }, ''); } catch (err) { /* ignore */ }
      return;
    }
    if (!state || !current || state.finished || state.submitted || state.bad_link || PP.flow.isEnd(current)) return;

    clearTimeout(advanceTimer);
    rebuildSteps();
    var p = place();
    var target = null;
    if (forward) {
      var next = steps[p.next];
      if (next && !PP.flow.isEnd(next) && PP.flow.canProceed(current, state, config)) target = next;
    } else {
      var wanted = s.pp ? PP.flow.indexOf(steps, s.pp) : -1;
      target = wanted !== -1 && wanted < p.at ? steps[wanted] : steps[Math.max(0, p.back)];
    }
    if (target && target.id !== current.id) showStep(target.id, 'none');
  }

  /* ---------------------------------------------------------------------------
     Language
     ------------------------------------------------------------------------- */
  function setLang(code, byUser) {
    PP.i18n.setLang(code);
    document.documentElement.lang = PP.i18n.bcp47(code);
    if (!preview) PP.store.set('lang', code); // a preview leaves real links' "last used language" alone
    if (state) {
      state.lang = code;
      if (byUser) state.lang_set_by_user = true;
    }
  }

  /* Tapped on the language screen. */
  function chooseLanguage(code) {
    setLang(code, true);
    state.lang_chosen = true;
    save();
    if (config.navigation.auto_advance !== false) {
      updateChrome();
      scheduleAdvance();
    } else {
      redraw();
    }
  }

  /* ---------------------------------------------------------------------------
     The help videos (28 Oct 2026; control panel: Settings > Help videos):
     config.help.how_to_fill_video and why_it_helps_video. The ⓘ button in
     the top bar shows only when one is set (a full https:// link) and the
     questionnaire has the texts it needs (help.button and the video's title:
     a version published before 28 Oct has none, and the form never shows a
     text's name). A YouTube link plays inside the form, in a frame made only
     when the partner taps it, so nothing extra loads before; any other link
     opens in a new tab.
     ------------------------------------------------------------------------- */
  var HELP_VIDEOS = [['how_to_fill_video', 'help.how_to_fill'], ['why_it_helps_video', 'help.why_it_helps']];
  function hasText(key) { return Boolean(PP.i18n.strings) && Object.prototype.hasOwnProperty.call(PP.i18n.strings, key); }
  function helpVideos() {
    var help = config && config.help && typeof config.help === 'object' ? config.help : {};
    if (!hasText('help.button')) return [];
    return HELP_VIDEOS.filter(function (v) {
      var url = help[v[0]];
      return typeof url === 'string' && /^https:\/\/\S+$/.test(url.trim()) && hasText(v[1]);
    }).map(function (v) { return { url: help[v[0]].trim(), key: v[1] }; });
  }
  /* The id of a YouTube video (watch?v=, youtu.be/, shorts/, embed/, live/), else null. */
  function youtubeId(url) {
    var m = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#\/]|$)/.exec(url);
    return m ? m[1] : null;
  }
  function openHelpSheet() {
    var videos = helpVideos();
    if (!videos.length) return;
    var backdrop = h('div', { 'class': 'sheet-backdrop' });
    var me = null;
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    // fromBack: the phone's Back key closed it (see onPopState). A click passes an event, never true.
    var close = function (fromBack) {
      if (!me) return;   // already closed
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);   // also stops a video that plays
      document.removeEventListener('keydown', onKey);
      sheetClosed(me, fromBack === true);
      me = null;
      try { el.helpBtn.focus(); } catch (e) { /* ignore */ }
    };
    var closeBtn = h('button', { type: 'button', 'class': 'icon-btn', 'aria-label': t('ui.close') }, [PP.icon('close')]);
    closeBtn.addEventListener('click', close);
    var body = h('div', { 'class': 'help-body' });
    var play = function (v) {
      var id = youtubeId(v.url);
      if (!id) {
        try { root.open(v.url, '_blank', 'noopener'); } catch (e) { /* the browser refused: nothing else to do */ }
        return;
      }
      PP.clear(body);
      body.appendChild(h('p', { 'class': 'help-title', text: t(v.key) }));
      // The page sends no Referer at all (index.html), so a link's dc and token never
      // leave it. YouTube refuses to play without one ("Video player configuration
      // error", Error 153: tried on 30 Oct 2026), so this frame alone sends the site's
      // address (https://<site>/), never its path or the ?dc=&t= part.
      body.appendChild(h('div', { 'class': 'video-frame' }, [h('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&autoplay=1',
        title: t(v.key), allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin'
      })]));
    };
    videos.forEach(function (v) {
      var b = h('button', { type: 'button', 'class': 'choice help-video' }, [PP.icon('play'), h('span', { text: t(v.key) })]);
      b.addEventListener('click', function () { play(v); });
      body.appendChild(b);
    });
    var sheet = h('div', { 'class': 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('help.button') }, [
      h('div', { 'class': 'sheet-head' }, [h('h2', { 'class': 'q-title', text: t('help.button') }), closeBtn]),
      body
    ]);
    backdrop.appendChild(sheet);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    me = showSheet(backdrop, close);
    var first = body.querySelector('button');
    if (first) first.focus();
  }

  /* The language button in the top bar. */
  function openLanguageSheet() {
    if (!config) return;
    var backdrop = h('div', { 'class': 'sheet-backdrop' });
    var me = null;
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    var close = function (fromBack) {   // fromBack: as in openHelpSheet
      if (!me) return;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
      sheetClosed(me, fromBack === true);
      me = null;
      try { el.langBtn.focus(); } catch (e) { /* ignore */ }
    };
    var closeBtn = h('button', { type: 'button', 'class': 'icon-btn', 'aria-label': t('ui.close') }, [PP.icon('close')]);
    closeBtn.addEventListener('click', close);
    var grid = h('div', { 'class': 'lang-grid' });
    (config.languages || []).forEach(function (L) {
      var on = L.code === PP.i18n.lang;
      var b = h('button', {
        type: 'button',
        'class': 'choice lang-choice' + (on ? ' is-selected' : ''),
        'aria-pressed': on ? 'true' : 'false',
        lang: L.bcp47
      }, L.native_name);
      b.addEventListener('click', function () {
        close();
        if (L.code === PP.i18n.lang) return;
        setLang(L.code, true);
        if (state) save();
        redraw();
      });
      grid.appendChild(b);
    });
    var sheet = h('div', { 'class': 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.language') }, [
      h('div', { 'class': 'sheet-head' }, [h('h2', { 'class': 'q-title', text: t('ui.language') }), closeBtn]),
      grid
    ]);
    backdrop.appendChild(sheet);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    me = showSheet(backdrop, close);
    var first = grid.querySelector('button');
    if (first) first.focus();
  }

  /* Sheets and the phone's Back key (30 Oct 2026). Android users press Back to
     dismiss a video or a list: without this, Back moved the survey a screen
     back underneath the open sheet, or left the form on the first screen.
     So an open sheet gets a history entry of its own: Back takes it, and
     onPopState closes the sheet. A sheet closed another way (its close
     button, a tap outside it, Escape, a language picked) takes its entry
     away again; onPopState ignores that step, which keeps the same depth.
     One sheet at a time; a screen change waiting to happen is cancelled. */
  function showSheet(backdrop, close) {
    var reuse = false;
    if (openSheet) {   // cannot normally happen (the backdrop covers both buttons)
      reuse = openSheet.entry;
      openSheet.close(true);   // its history entry is kept, for this sheet
    }
    clearTimeout(advanceTimer);
    advanceTimer = null;
    var me = { close: close, entry: reuse };
    // While one of the form's own steps back is still to arrive (a sheet closed a
    // moment ago), a new entry would be the one it takes: this sheet then goes
    // without one (Back moves the survey, as before 30 Oct). Practically never.
    if (!reuse && ownSteps === 0) {
      try {
        root.history.pushState({ pp: current ? current.id : null, n: navDepth, sheet: true }, '');
        me.entry = true;
      } catch (e) { /* no entry of its own: Back then moves the survey, as before */ }
    }
    openSheet = me;
    document.body.appendChild(backdrop);
    return me;
  }

  /* Every sheet's close() calls this. fromBack: the Back key closed it, so its
     history entry is already gone; otherwise the entry is taken away here. */
  function sheetClosed(me, fromBack) {
    if (openSheet === me) openSheet = null;
    if (me.entry && !fromBack) stepBack();
  }

  /* One step back that is the form's own (a sheet's entry taken away): its
     "popstate" is counted out in onPopState, so it never counts as a Back press. */
  function stepBack() {
    ownSteps += 1;
    try { root.history.back(); } catch (e) { ownSteps -= 1; }
  }

  /* ---------------------------------------------------------------------------
     Top bar, progress bar, bottom bar
     ------------------------------------------------------------------------- */
  function updateChrome() {
    document.title = t('brand.name');

    PP.clear(el.brand);
    var logo = config.branding && config.branding.logo;
    if (logo) el.brand.appendChild(h('img', { src: PP.assetUrl(logo), alt: '' }));
    el.brand.appendChild(document.createTextNode(t('brand.name')));

    var L = PP.i18n.language(PP.i18n.lang);
    PP.clear(el.langBtn);
    el.langBtn.appendChild(PP.icon('globe'));
    el.langBtn.appendChild(document.createTextNode(L ? L.native_name : PP.i18n.lang));
    el.langBtn.setAttribute('aria-label', t('ui.language') + ': ' + (L ? L.native_name : PP.i18n.lang));
    el.langBtn.hidden = (config.languages || []).length < 2 || Boolean(current && current.type === 'language_picker');
    if (el.helpBtn) {   // an older index.html (cached) has no help button
      var videos = helpVideos();
      PP.clear(el.helpBtn);
      el.helpBtn.appendChild(PP.icon('info'));
      if (videos.length) el.helpBtn.setAttribute('aria-label', t('help.button'));
      el.helpBtn.hidden = !videos.length;
    }

    // The strip at the top: "TEST MODE" (mock mode) or "PREVIEW" (preview
    // links, in every mode), plus how many texts still wait for a translation.
    if (preview || mode === 'mock') {
      var missing = PP.i18n.untranslatedCount(PP.i18n.lang);
      el.devBanner.textContent = t(preview ? 'dev.preview_banner' : 'dev.mock_banner') +
        (previewFallback ? ' · ' + t('dev.preview_fallback') : '') +
        (draftBroken ? ' · ' + t('dev.preview_broken') : '') +
        (missing ? ' · ' + t('dev.untranslated', { n: missing }) : '');
      el.devBanner.classList.toggle('is-preview', preview);
      el.devBanner.hidden = false;
    } else {
      el.devBanner.hidden = true;
    }

    updateProgress();
    updateNav();
  }

  function updateProgress() {
    el.progress.hidden = Boolean(current && PP.flow.isEnd(current) && NO_PROGRESS_BAR.indexOf(submit.status) !== -1);
    var pct = 100;
    if (current && !PP.flow.isEnd(current) && steps.length > 1) {
      pct = Math.max(4, Math.round((place().at / (steps.length - 1)) * 100));
    }
    el.progressFill.style.width = pct + '%';
    el.progress.setAttribute('aria-valuenow', String(pct));
  }

  function updateNav() {
    if (!current || !screen || !state || PP.flow.isEnd(current)) {
      el.navbar.hidden = true;
      return;
    }
    // Answers on this screen can add or remove later screens (show_if, jumps),
    // so work out the path again: the Next/Submit label and progress stay right.
    rebuildSteps();
    updateProgress();
    var p = place();
    var entry = current.entry || {};
    var nextStep = steps[p.next];
    var isLastQuestion = Boolean(nextStep && PP.flow.isEnd(nextStep));
    var canGo = PP.flow.canProceed(current, state, config);
    var showNext = true;
    var showSkip = false;

    if (screen.auto && config.navigation.auto_advance !== false) {
      // One-tap screens move on by themselves; Next only appears when coming back.
      var answered = PP.flow.isAnswered(current, state);
      showNext = answered;
      showSkip = !answered && entry.required === false;
    }
    if (screen.optional && !isLastQuestion && !PP.flow.hasDetail(state, current.id)) {
      showNext = false;
      showSkip = true;
    }

    el.back.textContent = t('ui.back');
    el.back.hidden = p.back < 0;
    el.skip.textContent = t('ui.skip');
    el.skip.hidden = !showSkip;
    el.next.textContent = t(isLastQuestion ? 'ui.submit' : (screen.nextLabel || 'ui.next'));
    el.next.hidden = !showNext;
    el.next.classList.toggle('is-disabled', !canGo);
    el.next.setAttribute('aria-disabled', canGo ? 'false' : 'true');
    el.navbar.hidden = el.back.hidden && el.skip.hidden && el.next.hidden;
  }

  /* ---------------------------------------------------------------------------
     Short messages under the top bar
     ------------------------------------------------------------------------- */
  function showNotice(text, ms, warn) {
    offlineShown = false;
    el.notice.textContent = text;
    el.notice.classList.toggle('is-warn', Boolean(warn));
    el.notice.hidden = false;
    clearTimeout(noticeTimer);
    if (ms) noticeTimer = setTimeout(function () { el.notice.hidden = true; }, ms);
  }

  /* A hint just above the bottom bar (visible even when scrolled down). */
  function showToast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    el.toast.hidden = true;
  }

  function showOffline(isOffline) {
    if (isOffline) {
      showNotice(t('net.offline'), 0, true);
      offlineShown = true;
    } else if (offlineShown) {
      el.notice.hidden = true;
      offlineShown = false;
    }
  }

  /* ---------------------------------------------------------------------------
     Finishing and sending
     ------------------------------------------------------------------------- */
  /* The ending this route reaches (there may be several, each with its own texts). */
  function thanksStep() {
    for (var i = 0; i < steps.length; i++) if (PP.flow.isEnd(steps[i])) return steps[i];
    return { id: 'thanks', type: 'thank_you', entry: {} };
  }

  function showThanks(endStep) {
    runCleanups();
    PP.speech.stop();
    current = endStep || thanksStep();
    state.current = current.id;
    save();
    renderCurrent();
    focusTitle();
  }

  /* Messages that end the visit: incomplete link, invalid link, already
     received, survey closed, survey not open yet. */
  function showTerminal(status) {
    clearTimeout(advanceTimer);
    runCleanups();
    PP.speech.stop();
    clearTimeout(submit.timer);
    clearInterval(submit.tick);
    submit.status = status;
    current = { id: 'thanks', type: 'thank_you', entry: {} };
    renderCurrent();
    focusTitle();
  }

  function finish(endStep) {
    clearTimeout(advanceTimer);
    runCleanups(); // stops a recording that is still running (it still gets saved)
    PP.speech.stop();
    state.finished = true;
    state.submitted_at = state.submitted_at || PP.now();
    state.submission_id = state.submission_id || PP.randomId('sub');
    state.finished_version = config.config_version;   // which questionnaire the answers belong to (buildPayload)
    finishedHere = true;
    current = endStep || thanksStep();
    state.current = current.id;
    recordView(current.id);
    save();
    // Remove the survey's history entries so the phone's back button now
    // leaves the page instead of stepping through answered screens.
    if (navDepth > 0) {
      collapsingHistory = true;
      try { root.history.go(-navDepth); } catch (e) { collapsingHistory = false; }
    }
    if (preview) {
      // A preview never sends anything: just say so.
      submit.status = 'preview';
      renderCurrent();
      return;
    }
    submit.status = 'sending';
    renderCurrent();
    // Wait for any voice note still being saved, then send.
    PP.voice.whenIdle().then(trySubmit);
  }

  function setSubmitStatus(status, retryIn) {
    submit.status = status;
    submit.retryIn = retryIn || 0;
    if (status !== 'failed') clearInterval(submit.tick);
    if (current && PP.flow.isEnd(current) && screen && screen.update) screen.update(submit);
    updateProgress();
  }

  /* The message sent. Its answers are fixed when the partner finishes: the
     first try (made once any voice note is saved) keeps them on the phone as
     state.sent_copy (answers, ratings, typed texts, and which voice notes go
     with them, without their sound, which is stored apart), and every later
     try, on this visit or a later one, sends that copy. A later visit may have
     loaded another questionnaire (a newer published version, or the form's
     own copy because Google was slow): building the answers from that one
     would drop those its route does not ask, and stamp its version (30 Oct
     2026). The copy is kept only when no voice note is still being saved (a
     try can start before: the "online" event, whenIdle's 5 s limit, or the
     page closing at once); otherwise it is made for this message only, and
     kept by a later try. */
  function buildPayload() {
    rebuildSteps();
    var meta = {
      survey_id: config.survey_id,
      config_version: config.config_version,
      app_version: APP_VERSION,
      dc: link.dc,
      t: link.t,
      round: link.round,
      lang: PP.i18n.lang,
      mode: mode,
      sent_at: PP.now(),
      attempt: state.submit_attempts,
      client: clientInfo(true)
    };
    var copy = state.sent_copy || null;
    if (!copy && (finishedHere || state.finished_version === config.config_version)) {
      copy = finishedCopy();
      if (!(PP.voice.isBusy && PP.voice.isBusy())) {   // (a cached older voice.js has no isBusy)
        state.sent_copy = copy;
        save();
      }
    }
    if (!copy) {
      // Finished on another questionnaire with a form from before 30 Oct 2026, and
      // never sent: the questionnaire in use is all there is to build from.
      return PP.flow.buildSubmission(config, state, steps, meta, function (itemId) {
        return PP.voice.loadAudio(ns, itemId);
      });
    }
    meta.survey_id = copy.survey_id;
    meta.config_version = copy.config_version;
    var payload = PP.flow.buildSubmission(config, state, [], meta, null);   // the envelope: dc, round, times, events
    payload.answers = copy.answers;
    payload.ratings = copy.ratings;
    payload.free_text = copy.free_text.map(function (item) {
      var out = {};
      Object.keys(item).forEach(function (k) { out[k] = item[k]; });
      out.audio = null;
      if (item.audio) {
        var b64 = PP.voice.loadAudio(ns, item.item_id);
        if (b64) out.audio = { mime: item.audio.mime, duration_s: item.audio.duration_s, bytes: item.audio.bytes, base64: b64 };
      }
      return out;
    }).filter(function (item) { return item.text || item.audio; });   // a voice note lost from the phone, and no text
    return payload;
  }

  /* The answers as the route of the questionnaire in use gives them now, with
     each voice note's details but not its sound (see buildPayload). */
  function finishedCopy() {
    var built = PP.flow.buildSubmission(config, state, steps, {}, function () { return '-'; });
    return {
      survey_id: config.survey_id,
      config_version: config.config_version,
      answers: built.answers,
      ratings: built.ratings,
      free_text: built.free_text.map(function (item) {
        var out = {};
        Object.keys(item).forEach(function (k) { out[k] = item[k]; });
        if (item.audio) out.audio = { mime: item.audio.mime, duration_s: item.audio.duration_s, bytes: item.audio.bytes };
        return out;
      })
    };
  }

  function trySubmit() {
    if (!state || state.submitted || submit.inFlight) return;
    if (preview) {
      setSubmitStatus('preview', 0); // nothing is ever sent from a preview
      return;
    }
    if (visitEnded) return; // the round is not open: "not open yet" stays on screen
    clearTimeout(submit.timer);
    clearInterval(submit.tick);
    submit.inFlight = true;
    setSubmitStatus('sending', 0);
    state.submit_attempts = (state.submit_attempts || 0) + 1;
    submit.sessionTries += 1;
    save();

    var payload;
    try {
      payload = buildPayload();
    } catch (e) {
      submit.inFlight = false;
      if (root.console) console.error('[Partner Pulse] Could not prepare the answers:', e);
      setSubmitStatus('error', 0);
      return;
    }
    var backend = config.backend || {};
    var timeoutMs = (Number(backend.request_timeout_seconds) || 90) * 1000;
    var minSpeed = Number(backend.slow_upload_bytes_per_second) || 1000;
    PP.net.postJSON(payload, timeoutMs, minSpeed).then(function (res) {
      submit.inFlight = false;
      if (res && res.ok) {
        onSubmitted(res);
      } else if (res && res.error === 'bad_token') {
        markBadLink();
        setSubmitStatus('bad_link', 0);
      } else if (res && res.error === 'round_not_open') {
        // The round is a draft (not started, or moved back by the admins).
        // Final for this visit: no retries. The answers stay on the phone
        // and are sent the next time the link is opened, once it is open.
        visitEnded = true;
        setSubmitStatus('not_open', 0);
      } else if (res && res.error === 'bad_request') {
        if (root.console) console.error('[Partner Pulse] The backend rejected the answers:', res.message);
        setSubmitStatus('error', 0);
      } else {
        scheduleRetry();
      }
    }, function () {
      submit.inFlight = false;
      scheduleRetry();
    });
  }

  function scheduleRetry() {
    if (visitEnded) return; // the "opened" ping already said the round is not open
    var delays = (config.backend && config.backend.retry_delays_seconds) || [5, 15, 30, 60];
    var i = submit.sessionTries - 1;
    if (i >= delays.length) {
      setSubmitStatus('failed', 0); // no more automatic tries; "Send now" stays
      return;
    }
    var waitS = Number(delays[i]) || 30;
    submit.retryAt = Date.now() + waitS * 1000;
    setSubmitStatus('failed', waitS);
    submit.timer = setTimeout(trySubmit, waitS * 1000);
    submit.tick = setInterval(function () {
      var left = Math.max(0, Math.ceil((submit.retryAt - Date.now()) / 1000));
      if (submit.status === 'failed') setSubmitStatus('failed', left);
    }, 1000);
  }

  function retryNow() { trySubmit(); }

  function onSubmitted(res) {
    clearTimeout(submit.timer);
    clearInterval(submit.tick);
    PP.voice.dropAll(ns);
    // Keep only a small marker; the answers themselves leave the phone.
    state = {
      v: 1,
      dc: state.dc,
      round: state.round,
      session_id: state.session_id,
      lang: state.lang,
      lang_chosen: state.lang_chosen,
      lang_set_by_user: state.lang_set_by_user,
      finished: true,
      submitted: true,
      submission_id: state.submission_id,
      submitted_at: state.submitted_at,
      received_at: res.received_at || null,
      answers: {},
      texts: {},
      audio: {},
      events: []
    };
    save();
    setSubmitStatus('done', 0);
  }

  /* Test mode and preview only: forget this phone's answers for this link and
     start again. (In preview this also fetches the latest draft.) */
  function startOver() {
    clearTimeout(saveTimer);
    if (ns) {
      PP.voice.dropAll(ns);
      PP.store.remove('state:' + ns);
    }
    // Forget them in memory too: the page saves its answers when it is left
    // (pagehide), which would otherwise write them straight back during the reload.
    state = null;
    reloadPage();
  }

  /* Loads the page again. Inside Google's page (Meesho-only mode) reloading
     its inner frame would show a blank page, so the page's own address is
     opened in the whole window instead (PP_EMBED.page, set by the web app). */
  function reloadPage() {
    var page = PP.net.embedded() && root.PP_EMBED.page;
    try {
      if (page) root.open(page, '_top');
      else root.location.reload();
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------------------
     Pings: opened / started / progress (never contain answers)
     ------------------------------------------------------------------------- */
  function telemetryOn() { return !(config.telemetry && config.telemetry.enabled === false); }

  function pingBody(stage) {
    var idx = current ? PP.flow.indexOf(steps, current.id) : -1;
    return {
      kind: 'ping',
      schema_version: 1,
      stage: stage,
      survey_id: config.survey_id,
      config_version: config.config_version,
      app_version: APP_VERSION,
      dc: link.dc,
      t: link.t,
      round: link.round,
      session_id: state.session_id,
      lang: PP.i18n.lang,
      mode: mode,
      screen: current ? current.id : null,
      step_index: idx,
      step_total: steps.length,
      at: PP.now()
    };
  }

  /* Always sent (even with telemetry off), because it also checks the link.
     Never sent from a preview. */
  function pingOpened() {
    if (preview || !PP.net.endpoint) return;
    var body = pingBody('opened');
    body.client = clientInfo(false);
    PP.net.postJSON(body, 15000).then(function (res) {
      if (!res || !state || state.submitted) return;
      if (res.ok === false && res.error === 'round_not_open') {
        // A draft round (the bootstrap did not arrive, so step 5 could not tell).
        endVisit('not_open');
      } else if (res.ok === false && res.error === 'bad_token') {
        markBadLink();
        if (!state.finished) showTerminal('bad_link'); // a finished survey shows its own sending status
      } else if (res.ok && state.bad_link) {
        // Rejected before, accepted now (backend fixed, or token corrected): carry on.
        state.bad_link = false;
        state.bad_token = null;
        save();
        if (!state.finished) showInitialScreen();
      } else if (res.ok && res.round_status === 'closed' && roundStatus === 'unknown' && !mayFinishLate()) {
        // The bootstrap did not arrive, so step 5 could not tell: the round
        // has closed and this partner has not started yet.
        roundStatus = 'closed';
        endVisit('closed');
      } else if (res.ok && res.already_submitted && !state.finished && !hasProgress()) {
        showTerminal('already');
      }
    }, function () { /* offline or slow: carry on; the token is checked again on submit */ });
  }

  function markStarted() {
    if (!state || state.started_at) return;
    state.started_at = PP.now();
    save();
    if (telemetryOn() && !preview) PP.net.beacon(pingBody('started'));
  }

  /* The partner switched apps or closed the page: remember where they were. */
  function onHide() {
    save();
    // Nothing is sent from a preview, nor after "closed" / "not open yet"
    // (a progress ping from that message screen would look like an unsent survey).
    if (preview || visitEnded || !state || state.submitted) return;
    if (Date.now() - lastProgressPing < 10000) return;
    lastProgressPing = Date.now();
    if (state.finished) {
      // Leaving while the answers are still on their way. A small answer set is
      // handed to the browser, which delivers it even after the page closes
      // (the backend ignores duplicates thanks to submission_id). Bigger ones
      // (voice notes) are sent the next time the link is opened.
      try {
        var data = JSON.stringify(buildPayload());
        if (data.length <= MAX_BEACON_CHARS && PP.net.beaconText(data)) return;
      } catch (e) { /* fall back to the progress ping below */ }
    }
    if (!telemetryOn()) return;
    var body = pingBody('progress');
    body.events = state.events.slice(-100);
    PP.net.beacon(body);
  }

  function clientInfo(full) {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var info = {
      ua: String(navigator.userAgent || '').slice(0, 300),
      viewport: (root.innerWidth || 0) + 'x' + (root.innerHeight || 0),
      tz_offset_min: new Date().getTimezoneOffset(),
      net: (conn && conn.effectiveType) || null
    };
    if (full) {
      info.voice_supported = PP.voice.isSupported(config);
      info.voice_denied = Boolean(state && state.voice_denied);
      info.tts_voice = Boolean(PP.speech.voiceFor(PP.i18n.bcp47(PP.i18n.lang)));
    }
    return info;
  }

  /* ---------------------------------------------------------------------------
     ?simulate=1 in test mode: load the developer drawer from the local test
     server (scripts/dev/simulate.js; never in web/, never in live mode).
     PP.dev is all it can reach. changed(): it edited state.answers / texts.
     ------------------------------------------------------------------------- */
  function loadSimulator() {
    if (!simulate || mode !== 'mock' || PP.dev) return;
    PP.dev = {
      config: function () { return config; },
      state: function () { return state; },
      context: flowContext,
      steps: function () { if (state) rebuildSteps(); return steps; },
      current: function () { return current; },
      changed: function () { markStarted(); save(); redraw(); },
      go: function (id) { showStep(id, 'push'); }
    };
    var tag = document.createElement('script');
    try { tag.src = new URL('/dev/simulate.js', PP.net.endpoint).href; } catch (e) { tag.src = '/dev/simulate.js'; }
    document.head.appendChild(tag);
  }

  /* ---------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------- */
  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    el.next.addEventListener('click', onNext);
    el.skip.addEventListener('click', function () { if (current && state) goNext(); });
    el.back.addEventListener('click', onBack);
    el.langBtn.addEventListener('click', openLanguageSheet);
    if (el.helpBtn) el.helpBtn.addEventListener('click', openHelpSheet);
    // Any new tap hides the hint above the bottom bar.
    document.addEventListener(root.PointerEvent ? 'pointerdown' : 'touchstart', hideToast, true);
    // Double-tap guard: a tap on an answer, Next or Skip that lands within
    // GUARD_MS of a new screen appearing was meant for the previous screen.
    document.addEventListener('click', function (e) {
      if (Date.now() - shownAt >= GUARD_MS) return;
      var target = e.target;
      if (target && target.closest &&
          (target.closest('#screen') || target.closest('#nav-next') || target.closest('#nav-skip'))) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    // Another tab sent this link's answers: show "Already received" here too.
    root.addEventListener('storage', function (e) {
      if (!ns || !state || state.submitted || e.key !== 'vpp:v1:state:' + ns || !e.newValue) return;
      try {
        var other = JSON.parse(e.newValue);
        if (other && other.submitted) sentInAnotherTab(other);
      } catch (err) { /* ignore */ }
    });
    root.addEventListener('popstate', onPopState);
    root.addEventListener('online', function () {
      showOffline(false);
      if (state && state.finished && !state.submitted && !state.bad_link && submit.status !== 'error') trySubmit();
    });
    root.addEventListener('offline', function () { showOffline(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') onHide();
    });
    root.addEventListener('pagehide', onHide);
    // After a reload, continue counting from the history entry we are on.
    var hs = root.history.state;
    navDepth = hs && typeof hs.n === 'number' ? hs.n : 0;
    // Reloaded on a sheet's entry (the page was reloaded, or Android brought a
    // discarded tab back, while a sheet was open): no sheet is open now, so step
    // off that entry, or the next Back press would do nothing.
    if (hs && hs.sheet) stepBack();
  }

  function absoluteUrl(url) {
    try { return new URL(url, root.location.href).href; } catch (e) { return url; }
  }

  /* Own keys only: a code such as "constructor" must never find what every
     JavaScript object inherits. */
  function has(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k); }

  /* The phone's answers, typed texts and voice notes are kept in maps that
     inherit nothing, for the same reason (web/js/voice.js fills the typing
     box from state.texts[id]). Saved and read back as ordinary JSON. */
  function dict(src) {
    var out = Object.create(null);
    if (src && typeof src === 'object') Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    return out;
  }

  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var finishWith = function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      var timer = setTimeout(function () { finishWith(fallback); }, ms);
      promise.then(finishWith, function () { finishWith(fallback); });
    });
  }

  function applyBranding() {
    var colors = (config.branding && config.branding.colors) || {};
    var map = {
      primary: '--c-primary',
      on_primary: '--c-on-primary',
      background: '--c-bg',
      surface: '--c-surface',
      text: '--c-text',
      muted: '--c-muted',
      border: '--c-border',
      error: '--c-error',
      success: '--c-success'
    };
    Object.keys(map).forEach(function (k) {
      var v = colors[k];
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) document.documentElement.style.setProperty(map[k], v);
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && colors.primary) meta.setAttribute('content', colors.primary);
  }

  /* The only texts not in strings.json: shown when strings.json itself could not load. */
  function showBootError() {
    PP.clear(el.screen);
    el.screen.appendChild(h('div', { 'class': 'boot-error' }, [
      h('p', { text: 'Could not load the survey. Please check your internet connection and try again.' }),
      h('p', { lang: 'hi-IN', text: 'सर्वे लोड नहीं हो पाया। कृपया इंटरनेट कनेक्शन चेक करके फिर से कोशिश करें।' }),
      h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: reloadPage } },
        'Retry / फिर से कोशिश करें')
    ]));
  }

  boot();

}(window));
