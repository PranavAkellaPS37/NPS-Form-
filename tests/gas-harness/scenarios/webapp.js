/* =============================================================================
   scenarios/webapp.js  -  C (doGet) and D (doPost): the public web app

   WHAT THIS FILE IS
     Talks to doGet / doPost exactly like a partner's phone (text/plain JSON
     bodies, Apps Script-shaped event objects) and checks every answer and
     every row written, against docs/submission-format.md and
     docs/control-panel-design.md sections 11 and 12:
       C   health, bootstrap (published / draft=1 / unknown round),
           whats_changed, the cache and its Drive fallback
       D1  pings (token, round status, rate limit)
       D2  a full submission: every column of every data tab, the voice note
       D3  duplicates, "seen before", already_submitted, round counts
       D4  refused submissions (bad token, draft / unknown round), late ones
       D5  malformed messages -> bad_request, nothing stored
       D6  busy lock -> server_error "busy, try again"
       D7  full data tabs grow; several large voice notes
       D8  partner texts that look like formulas, numbers or dates stay text
       D9  a round whose store is missing is created on first write
       D10 size limits: oversized lists, answers and pings; at most 10
           stored submissions per DC; voice notes decoded only after the
           token check
       D11 the links CSV (panelGenerateLinks) neutralises cells that would
           run as formulas in Excel or Sheets
       D12 pings keep config_version (the questionnaire the phone showed) in
           the last column of the pings tab; a round spreadsheet made before
           26 Oct 2026 gets that column from its first ping, safely (an
           admin's own column moves right, a busy lock, two pings at once)

   HOW TO USE IT
     Loaded by run-tests.js (node run-tests.js --only C,D).
   ============================================================================= */
'use strict';

const K = require('../lib/testkit');
const C = require('../lib/contract');
const H = require('../lib/helpers');

const P = (h, s, fn, args, opts) => K.call(h, s, fn, args, Object.assign({ context: 'panel' }, opts || {}));

/* Set up, publish v1, open 2026-R1. */
function openRound(s) {
  const h = H.setupPublished(s);
  const opened = P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
  s.need(opened && opened.ok, 'round 2026-R1 opens', K.show(opened));
  const bookId = H.roundBookId(h, '2026-R1');
  s.need(bookId && h.admin.findBook(bookId), 'round 2026-R1 has a data spreadsheet', K.show(H.roundInfo(h, '2026-R1')));
  const secret = H.secretOf(h);
  const tk = (dc, round) => K.token(secret, dc, round || '2026-R1');
  const rows = (tab) => (h.admin.table(bookId, tab) || { rows: [] }).rows;
  return { h, bookId, secret, tk, rows };
}

const expectNullAsBlank = (v) => (v === null || v === undefined ? '' : v);

module.exports = function register(add) {
  add('C', 'doGet: health, bootstrap (published, draft=1, unknown round), whats_changed, cache and Drive fallback', async (s) => {
    const h = H.setupPublished(s);
    const facts = C.repoFacts();
    let j = K.webJson(s, K.webGet(h, { action: 'health' }), 'health');
    s.ok(j && j.ok === true && j.service === 'valmo-partner-pulse' && j.mode === 'live' && H.isIso(j.time) && j.live_version === 1,
      'health = { ok: true, service, mode: "live", time, live_version: 1 }', K.show(j));
    // Since 23 Oct 2026 (flow-graph stage 4): which route code this deployment runs (Flow.gs).
    s.ok(j && j.flow_engine === 2 && j.flow_fingerprint === h.get('PP_FLOW_FINGERPRINT_') && /^[0-9a-f]{64}$/.test(j.flow_fingerprint || ''),
      'health also shows flow_engine 2 and flow_fingerprint (Flow.gs\'s SHA-256)', K.show(j && { flow_engine: j.flow_engine, flow_fingerprint: j.flow_fingerprint }));
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' }), 'bootstrap');
    s.need(j && j.ok === true, 'bootstrap answers ok', K.show(j));
    s.ok(j.draft === false && j.version === 1 && /^p1-\d{4}-\d{2}-\d{2}$/.test(j.config_version), 'bootstrap: draft false, version 1, config_version p1-…', K.show({ draft: j.draft, version: j.version, config_version: j.config_version }));
    s.eq(j.round, { id: 'DEMO-R1', status: 'draft' }, 'bootstrap: round { id, status }');
    s.eq(j.survey && j.survey.flow, facts.graph, 'bootstrap: the published flow (the graph of the repo\'s list)');
    s.eq(C.flowIdsOf(j.survey && j.survey.flow), facts.flowIds, 'bootstrap: its screens in order');
    s.eq(j.strings && j.strings['q.nps'], facts.strings['q.nps'], 'bootstrap: the published texts');
    s.eq(j.whats_changed, { title: null, items: facts.whats_changed.rounds['DEMO-R1'].items }, 'bootstrap: that round\'s "what changed" block');
    s.eq(j.clips, {}, 'bootstrap: clips');
    s.ok(j.survey && j.survey.backend && !('mode' in j.survey.backend) && !('apps_script_url' in j.survey.backend) && !('links' in j.survey),
      'bootstrap never sends backend mode/URLs or links (they stay in the repo file)', K.show(j.survey && j.survey.backend));
    // A round the backend has never seen is reported as "draft", as the contract says (section 12), so the
    // form says "not open yet" at once. Pings and answers for it still get round_not_open (D1, D4).
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'NOPE-R9' }), 'bootstrap unknown round');
    s.ok(j && j.ok === true && K.deepEqual(j.round, { id: 'NOPE-R9', status: 'draft' }) && K.deepEqual(j.whats_changed, { title: null, items: [] }),
      'a round never seen before: reported as "draft" (the form says "not open yet"), empty "what changed"', K.show(j && { round: j.round, whats_changed: j.whats_changed }));
    const again = K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' });
    const uses = again.run ? Array.from(again.run.uses.keys()) : [];
    s.soft(!uses.some((u) => /^(DriveApp|File|Folder|Blob)\./.test(u)), 'a repeated bootstrap is served from the cache (no Drive reads)', uses.join(', '));
    s.soft(!uses.some((u) => /^(Spreadsheet|Sheet|Range)\./.test(u)), 'a published bootstrap does not read the Sheet (fast)', uses.filter((u) => /^(Spreadsheet|Sheet|Range)/.test(u)).join(', '));
    h.admin.cache.clear();
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' }), 'bootstrap with an empty cache');
    s.ok(j && j.ok === true && j.version === 1, 'with the cache emptied, bootstrap reads the Drive copy', K.show(j && j.version));
    s.ok(!!h.admin.cache.get('live:1:k'), 'and puts it back into the cache');
    const count = Number(h.admin.cache.get('live:1:k'));
    h.admin.cache.set('live:1:k', String(count + 2), 600);
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' }), 'bootstrap with a damaged cache');
    s.ok(j && j.ok === true && j.version === 1, 'a damaged cache entry falls back to Drive', K.show(j && j.version));
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    m.texts['q.nps'].en = 'Draft only: a preview text';
    P(h, s, 'panelSave', [L.revision, m], { need: true });
    const keysBefore = h.admin.cache.entries().map((e) => e.key).sort();
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R1', draft: '1', pk: H.previewKeyOf(h) }), 'bootstrap draft=1');
    s.ok(j && j.ok === true && j.draft === true && j.version === null && j.config_version === 'draft' && j.strings['q.nps'].en === 'Draft only: a preview text',
      'draft=1 compiles the saved tabs: draft true, version null, config_version "draft"', K.show(j && { draft: j.draft, version: j.version, config_version: j.config_version }));
    const keysAfter = h.admin.cache.entries().map((e) => e.key).sort();
    const newKeys = keysAfter.filter((k) => keysBefore.indexOf(k) < 0 && !/^round:/.test(k));
    s.ok(newKeys.every((k) => /^draft:/.test(k)), 'a draft bootstrap caches only the compiled draft (draft:*)', K.show(newKeys));
    const draftEntries = h.admin.cache.entries().filter((e) => /^draft:/.test(e.key));
    s.ok(draftEntries.length > 0 && draftEntries.every((e) => e.secondsLeft <= 30), 'the compiled draft is kept for 30 seconds at most', K.show(draftEntries.map((e) => e.key + ' ' + e.secondsLeft + ' s')));
    const L2 = P(h, s, 'panelLoad', [], { need: true });
    P(h, s, 'panelSave', [L2.revision, L2.model], { need: true });
    s.ok(!h.admin.cache.entries().some((e) => e.key === 'draft:k'), 'every save clears the compiled draft, so the next preview shows the new draft', K.show(h.admin.cache.entries().map((e) => e.key)));
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R1' }), 'bootstrap after a draft change');
    s.eq(j && j.strings['q.nps'].en, facts.strings['q.nps'].en, 'partners keep getting the published text until Publish');
    h.admin.options.webappActiveSpreadsheet = 'null';
    j = K.webJson(s, K.webGet(h, { action: 'bootstrap', round: '2026-R1', draft: '1', pk: H.previewKeyOf(h) }), 'bootstrap draft=1 when the web app cannot see the Sheet');
    s.soft(j && j.ok === true && j.draft === true, 'draft=1 still works if getActiveSpreadsheet() gives null in the web app', K.show(j && (j.error || j.message)));
    h.admin.options.webappActiveSpreadsheet = 'bound';
    j = K.webJson(s, K.webGet(h, { action: 'whats_changed', round: 'DEMO-R1' }), 'whats_changed');
    s.ok(j && j.ok === true && j.round === 'DEMO-R1' && j.title === null && Array.isArray(j.items) && j.items.length === facts.whats_changed.rounds['DEMO-R1'].items.length,
      'whats_changed = { ok, round, title: null, items } (kept for compatibility)', K.show(j));
    j = K.webJson(s, K.webGet(h, { action: 'nonsense' }), 'unknown action');
    s.ok(j && j.ok === false, 'an unknown action answers { ok: false, ... }', K.show(j));
    j = K.webJson(s, K.webGet(h, {}), 'no action');
    s.ok(j && typeof j.ok === 'boolean', 'a request without an action still answers JSON', K.show(j));
    H.contractClean(s, h);
  });

  add('C2', 'A fully translated questionnaire (long texts in Indian scripts) is published, cached in pieces under 100 KB, and served', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    const letters = { hi: 'क', ta: 'த', te: 'త', kn: 'ಕ', ml: 'ക' };
    for (const key of Object.keys(m.texts)) {
      const placeholders = (String(m.texts[key].en).match(/\{[A-Za-z0-9_]+\}/g) || []).join(' ');
      for (const [code, letter] of Object.entries(letters)) m.texts[key][code] = (letter.repeat(150) + ' ' + placeholders).trim();
    }
    const v = P(h, s, 'panelValidate', [m]);
    s.need(v && v.errors.length === 0, 'the translated questionnaire has no errors', K.show(v && v.errors.slice(0, 3)));
    const sv = P(h, s, 'panelSave', [L.revision, m], { need: true });
    const pub = P(h, s, 'panelPublish', [sv.revision, 'All languages translated'], { need: true });
    s.need(pub && pub.ok, 'it publishes', K.show(pub));
    const text = h.admin.drive.text(h.admin.props.script.get('LIVE_FILE_ID')) || '';
    s.note(`Published document: ${text.length} characters, ${Buffer.byteLength(text)} bytes (validation limit: 200,000 characters).`);
    const parts = h.admin.cache.entries().filter((e) => new RegExp('^live:' + pub.version + ':\\d+$').test(e.key));
    s.ok(parts.length > 1 && parts.every((e) => e.bytes <= 100 * 1024), 'the cache holds it in several pieces, each under 100 KB counted in bytes',
      K.show(parts.map((e) => `${e.key}: ${e.bytes} bytes`)));
    const res = K.webGet(h, { action: 'bootstrap', round: 'DEMO-R1' });
    const j = K.webJson(s, res, 'bootstrap of the translated questionnaire');
    s.ok(j && j.ok === true && j.version === pub.version && String(j.strings['q.nps'].ta).charAt(0) === 'த', 'partners get the translated texts', K.show(j && j.version));
    const uses = res.run ? Array.from(res.run.uses.keys()) : [];
    s.soft(!uses.some((u) => /^(DriveApp|File|Folder|Blob)\./.test(u)), 'it is served from the cache, not read from Drive each time', uses.join(', '));
    H.contractClean(s, h);
  });

  add('D1', 'doPost pings: token check, round status, what is stored, rate limit', async (s) => {
    const { h, bookId, tk, rows } = openRound(s);
    let res = K.webPost(h, K.makePing({ dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001') }));
    let j = K.webJson(s, res, 'ping opened');
    s.eq(j, { ok: true, token_valid: true, already_submitted: false, round_status: 'open' }, 'answer to "opened": { ok, token_valid, already_submitted: false, round_status }');
    s.soft(res.run && (res.run.writes.get(`Valmo Partner Pulse - data - 2026-R1 / pings`) || {}).appendRow === 1, 'the ping is stored with appendRow', K.show(res.run && Object.fromEntries(res.run.writes)));
    const row = rows('pings').find((r) => r.dc === 'DC-DEMO-001' && r.stage === 'opened');
    s.need(row, 'the opened ping is stored in the pings tab', K.show(rows('pings')));
    s.ok(H.isIso(row.received_at), 'pings.received_at is an ISO time', K.show(row.received_at));
    const want = { round: '2026-R1', session_id: 'ses_harnessping001', lang: 'hi', screen: 'nps', step_index: 2, step_total: 13,
      at: '2026-10-20T05:00:00.000Z', token_valid: true, mode: 'live', client_net: '4g', config_version: 'p1-2026-10-20' };
    for (const [k, v] of Object.entries(want)) s.eq(row[k], v, `pings.${k}`);
    s.ok(H.blankish(row.events_json), 'pings.events_json is empty for "opened"', K.show(row.events_json));
    j = K.webJson(s, K.webPost(h, K.makePing({ stage: 'started', dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001') })), 'ping started');
    s.ok(j && j.ok === true, 'a "started" ping is accepted', K.show(j));
    const events = [{ seq: 1, screen: 'nps', at: '2026-10-20T05:00:01.000Z' }, { seq: 2, screen: 'fn_rating:losses', at: '2026-10-20T05:00:09.000Z' }];
    j = K.webJson(s, K.webPost(h, K.makePing({ stage: 'progress', dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001'), events })), 'ping progress');
    const prog = rows('pings').find((r) => r.stage === 'progress');
    let parsed = null;
    try { parsed = JSON.parse(prog && prog.events_json); } catch (e) { /* reported */ }
    s.eq(parsed, events, 'a "progress" ping stores its events as JSON in events_json');
    const n = rows('pings').length;
    const refusals = [
      ['a wrong token', K.makePing({ dc: 'DC-DEMO-001', round: '2026-R1', t: 'AAAAAAAAAAAAAAAAAAAAAA' }), 'bad_token'],
      ['no token', K.makePing({ dc: 'DC-DEMO-001', round: '2026-R1' }), 'bad_token'],
      ['another DC\'s token', K.makePing({ dc: 'DC-DEMO-002', round: '2026-R1', t: tk('DC-DEMO-001') }), 'bad_token'],
      ['a draft round', K.makePing({ dc: 'DC-DEMO-001', round: 'DEMO-R1', t: tk('DC-DEMO-001', 'DEMO-R1') }), 'round_not_open'],
      ['an unknown round', K.makePing({ dc: 'DC-DEMO-001', round: 'NOPE-R9', t: tk('DC-DEMO-001', 'NOPE-R9') }), 'round_not_open'],
      ['an unknown stage', K.makePing({ stage: 'finished', dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001') }), 'bad_request'],
      ['a DC id with "/"', K.makePing({ dc: 'DC/../1', round: '2026-R1', t: tk('DC/../1') }), 'bad_request']
    ];
    for (const [label, body, error] of refusals) {
      j = K.webJson(s, K.webPost(h, body), `ping with ${label}`);
      s.ok(j && j.ok === false && j.error === error, `a ping with ${label} is refused: ${error}`, K.show(j));
    }
    s.eq(rows('pings').length, n, 'refused pings are never stored');
    s.ok(!(H.roundInfo(h, 'DEMO-R1') || {}).sheet_id, 'a ping to a draft round creates no data spreadsheet', K.show(H.roundInfo(h, 'DEMO-R1')));
    let allOk = true;
    for (let i = 0; i < 65; i += 1) {
      const a = K.webPost(h, K.makePing({ stage: 'progress', dc: 'DC-RATE-001', round: '2026-R1', t: tk('DC-RATE-001') }));
      if (!a.json || a.json.ok !== true) allOk = false;
    }
    s.ok(allOk, 'pings over the rate limit are still answered { ok: true }');
    s.eq(rows('pings').filter((r) => r.dc === 'DC-RATE-001').length, 60, 'at most 60 pings per DC and round are stored in 10 minutes');
    const pc = h.admin.cache.entries().find((x) => x.key === 'pc:DC-RATE-001:2026-R1');
    s.soft(pc && pc.secondsLeft <= 600, 'the ping counter pc:<dc>:<round> lives at most 10 minutes (section 18)', K.show(pc && pc.secondsLeft));
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'closed']);
    j = K.webJson(s, K.webPost(h, K.makePing({ dc: 'DC-DEMO-009', round: '2026-R1', t: tk('DC-DEMO-009') })), 'ping on a closed round');
    s.ok(j && j.ok === true && j.round_status === 'closed', 'a closed round still accepts pings and says "closed"', K.show(j));
    H.contractClean(s, h);
  });

  add('D2', 'doPost submit: every column of responses, function_ratings, free_text, events; the voice note in Drive', async (s) => {
    const { h, bookId, tk, rows } = openRound(s);
    const body = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_harness_0001' });
    const res = K.webPost(h, body);
    const j = K.webJson(s, res, 'submit');
    s.need(j && j.ok === true && j.submission_id === 'sub_harness_0001' && j.duplicate === false && H.isIso(j.received_at),
      'answer: { ok: true, submission_id, duplicate: false, received_at }', K.show(j));
    s.note(`One submission with a voice note took ${res.run ? res.run.ms : '?'} ms in the harness.`);
    const resp = rows('responses').filter((r) => r.submission_id === 'sub_harness_0001');
    s.need(resp.length === 1, 'exactly one responses row', K.show(resp));
    const r = resp[0];
    const want = { received_at: j.received_at, submission_id: 'sub_harness_0001', dc: 'DC-DEMO-001', round: '2026-R1', lang: 'hi', nps: 6,
      support_contacted: 'yes', late: false, token_valid: true, dc_round_seen_before: false, opened_at: body.opened_at, started_at: body.started_at,
      submitted_at: body.submitted_at, sent_at: body.sent_at, attempt: 1, resume_count: 0, config_version: body.config_version,
      app_version: '0.1.0', mode: 'live', session_id: body.session_id, client_net: '3g', client_ua: body.client.ua, client_viewport: '360x740',
      client_tz_offset_min: -330, voice_supported: true, voice_denied: false, tts_voice: true, events_count: body.events.length };
    for (const [k, v] of Object.entries(want)) s.eq(r[k], v, `responses.${k}`);
    let answers = null;
    try { answers = JSON.parse(r.answers_json); } catch (e) { /* reported */ }
    s.eq(answers, body.answers, 'responses.answers_json = JSON.stringify(answers)');
    const fr = rows('function_ratings').filter((x) => x.submission_id === 'sub_harness_0001');
    s.eq(fr.length, body.ratings.length, 'one function_ratings row per rating');
    body.ratings.forEach((rt, i) => {
      const got = fr[i] || {};
      s.eq([got.received_at, got.dc, got.round, got.block, got.item, got.rating, got.not_applicable, got.threshold, got.below_threshold, got.issue_code],
        [j.received_at, 'DC-DEMO-001', '2026-R1', rt.block, rt.item, expectNullAsBlank(rt.rating), rt.not_applicable, expectNullAsBlank(rt.threshold),
          expectNullAsBlank(rt.below_threshold), expectNullAsBlank(rt.issue_code)], `function_ratings row ${i + 1} (${rt.item}; null -> empty cell)`);
    });
    const ft = rows('free_text').filter((x) => x.submission_id === 'sub_harness_0001');
    s.eq(ft.map((x) => x.item_id), body.free_text.map((x) => x.item_id), 'one free_text row per item, in order');
    const voice = ft.find((x) => x.item_id === 'fn_deep_dive:losses') || {};
    const sent = body.free_text[0];
    s.ok(voice.lang === 'hi' && voice.block === 'function' && voice.function === 'losses' && voice.issue_code === 'no_proof' && voice.question_key === 'q.tell_more' &&
      voice.text === sent.text, 'free_text: lang, block, function, issue_code, question_key, text', K.show(voice));
    s.ok(voice.audio_mime === 'audio/webm;codecs=opus' && voice.audio_duration_s === 2.4 && voice.audio_bytes === 2048, 'free_text: audio_mime, audio_duration_s, audio_bytes', K.show(voice));
    const file = voice.audio_file_id ? h.admin.drive.byId(voice.audio_file_id) : null;
    s.ok(file, 'free_text.audio_file_id is a Drive file', K.show(voice.audio_file_id));
    if (file) {
      s.eq(h.admin.drive.path(file.id), 'Valmo Partner Pulse/rounds/2026-R1/audio/DC-DEMO-001__sub_harness_0001__fn_deep_dive-losses.webm',
        'the voice note is rounds/2026-R1/audio/<dc>__<submission_id>__<item_id with ":" as "-">.webm');
      s.ok(Buffer.compare(h.admin.drive.bytes(file.id), K.fakeAudio(2048)) === 0, 'the voice note file holds exactly the recorded bytes');
      s.ok(String(voice.audio_url) === `https://drive.google.com/file/d/${file.id}/view?usp=drivesdk`, 'free_text.audio_url is the file\'s Drive address', K.show(voice.audio_url));
    }
    const typed = ft.find((x) => x.item_id === 'fn_deep_dive:linehaul') || {};
    s.eq(typed.text, 'truck raat 2 baje aata hai 🙏 சரி', 'mixed scripts and emoji are stored exactly');
    s.ok(H.blankish(typed.audio_url) && H.blankish(typed.audio_file_id) && H.blankish(typed.audio_mime), 'a typed-only item has empty audio columns', K.show(typed));
    const later = ['transcript', 'transcript_lang', 'transcribed_at', 'cls_function', 'cls_issue_code', 'cls_severity', 'cls_sentiment', 'cls_summary_en',
      'cls_confidence', 'cls_unmapped', 'cls_new_theme_label', 'cls_provider', 'classified_at'];
    s.ok(ft.every((x) => later.every((k) => H.blankish(x[k]))), 'transcript and cls_* columns stay empty (Phase 3 fills them)');
    const ev = rows('events').filter((x) => x.submission_id === 'sub_harness_0001');
    s.eq(ev.map((x) => [x.session_id, x.dc, x.round, x.seq, x.screen, x.at]), body.events.map((e) => [body.session_id, 'DC-DEMO-001', '2026-R1', e.seq, e.screen, e.at]),
      'one events row per screen view (session_id, dc, round, seq, screen, at)');
    if (res.run) {
      const writes = Object.fromEntries(res.run.writes);
      for (const tab of ['responses', 'function_ratings', 'free_text', 'events']) {
        const w = writes[`Valmo Partner Pulse - data - 2026-R1 / ${tab}`] || {};
        s.soft(w.setValues === 1 && !w.appendRow, `${tab}: written with one setValues (rows in a batch)`, K.show(w));
      }
      // 8 s since 20 Oct (PP_SRV.SUBMIT_LOCK_MS): a long wait would tie up Google's ~30 simultaneous runs;
      // a busy answer just makes the phone send again (D6). Only the script lock: never the admins' document lock.
      s.soft(K.deepEqual(res.run.lockLog, ['script:8000', 'script:release']),
        'the submission waits only for the script lock, with tryLock(8000), and releases it (never the document lock)', K.show(res.run.lockLog));
      s.soft(!res.run.lockLeftHeld, 'the lock is released before the answer');
    }
    s.ok(h.admin.cache.get('sub:sub_harness_0001'), 'the cache remembers sub:<submission_id> (for fast duplicates)');
    const life = (key) => { const e = h.admin.cache.entries().find((x) => x.key === key); return e ? e.secondsLeft : null; };
    // 15 minutes since 20 Oct (PP_SRV.SUB_CACHE_SECONDS = 900): the cache keeps only about 1,000 items, and the
    // responses tab is the real duplicate check (D3 finds a resend there after the cache forgot it).
    s.ok(life('sub:sub_harness_0001') > 800 && life('sub:sub_harness_0001') <= 900, 'sub:<id> is kept for 15 minutes (900 s; contract sections 12 and 18)',
      K.show(life('sub:sub_harness_0001')));
    s.soft(life('round:2026-R1') !== null && life('round:2026-R1') <= 60, 'round:<id> is kept for at most 60 seconds (section 18)', K.show(life('round:2026-R1')));
    H.contractClean(s, h);
  });

  add('D3', 'Duplicates, "seen before", already_submitted and panelRoundCounts', async (s) => {
    const { h, tk, rows } = openRound(s);
    const body = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_harness_0001' });
    const first = K.webJson(s, K.webPost(h, body), 'first submit');
    s.need(first && first.ok, 'the first submission is stored', K.show(first));
    const count = () => ['responses', 'function_ratings', 'free_text', 'events'].map((t) => rows(t).length);
    const before = count();
    const files = () => h.admin.drive.items().filter((x) => /\/audio$/.test(h.admin.drive.path(x.parentId || ''))).length;
    const filesBefore = files();
    let j = K.webJson(s, K.webPost(h, Object.assign({}, body, { attempt: 2 })), 'resend');
    s.eq(j, { ok: true, submission_id: 'sub_harness_0001', duplicate: true, received_at: first.received_at }, 'a resend answers duplicate: true with the original received_at');
    h.admin.cache.clear();
    j = K.webJson(s, K.webPost(h, Object.assign({}, body, { attempt: 3 })), 'resend after the cache forgot it');
    s.eq(j, { ok: true, submission_id: 'sub_harness_0001', duplicate: true, received_at: first.received_at }, 'with the cache emptied, the duplicate is found in the sheet (same received_at)');
    s.eq(count(), before, 'duplicates write no rows');
    s.eq(files(), filesBefore, 'duplicates save no second voice note');
    const second = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_harness_0002', lang: 'en', audioBytes: 0 })), 'second submission of the same DC');
    s.ok(second && second.ok && second.duplicate === false, 'a new submission_id from the same DC is stored', K.show(second));
    const r2 = rows('responses').find((x) => x.submission_id === 'sub_harness_0002');
    s.eq(r2 && r2.dc_round_seen_before, true, 'dc_round_seen_before = TRUE for the DC\'s second submission');
    j = K.webJson(s, K.webPost(h, K.makePing({ dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001') })), 'opened ping after submitting');
    s.ok(j && j.already_submitted === true, 'an "opened" ping after a submission says already_submitted: true', K.show(j));
    j = K.webJson(s, K.webPost(h, K.makePing({ dc: 'DC-DEMO-002', round: '2026-R1', t: tk('DC-DEMO-002') })), 'opened ping, other DC');
    s.ok(j && j.already_submitted === false, 'another DC is not "already submitted"', K.show(j));
    const upper = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-003', t: tk('DC-DEMO-003'), round: '2026-R1', submission_id: 'SUB_HARNESS_0001', audioBytes: 0 })), 'an id differing only in capitals');
    s.soft(upper && upper.ok && upper.duplicate === false, 'a submission_id that differs only in capitals is a different submission (TextFinder ignores capitals)', K.show(upper));
    const lowerDc = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'dc-demo-001', t: tk('dc-demo-001'), round: '2026-R1', submission_id: 'sub_harness_0004', audioBytes: 0 })), 'a DC differing only in capitals');
    const rl = rows('responses').find((x) => x.submission_id === 'sub_harness_0004');
    s.soft(lowerDc && lowerDc.ok && rl && rl.dc_round_seen_before === false, 'a DC id that differs only in capitals is a different DC', K.show(rl));
    h.admin.writeRows(null, 'DCs', 2, [['DC-DEMO-001', 'One', 'S', 'R', 'hi', true], ['DC-DEMO-002', 'Two', 'S', 'R', 'ta', true]]);
    P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }]);
    K.webPost(h, K.makePing({ stage: 'started', dc: 'DC-DEMO-002', round: '2026-R1', t: tk('DC-DEMO-002') }));
    const counts = P(h, s, 'panelRoundCounts', ['2026-R1']);
    s.ok(counts && counts.links === 2, 'panelRoundCounts.links = rows in Links for the round', K.show(counts));
    const distinctDcs = new Set(rows('responses').map((x) => x.dc)).size;
    s.ok(counts && counts.submitted === distinctDcs && counts.opened >= 2 && counts.started >= 1,
      `panelRoundCounts counts distinct DCs per stage (submitted = ${distinctDcs} distinct DCs in responses)`, K.show(counts));
    s.ok(counts && counts.by_lang && counts.by_lang.hi >= 1 && H.isIso(counts.last_submission_at), 'panelRoundCounts.by_lang and last_submission_at', K.show(counts));
    H.contractClean(s, h);
  });

  add('D4', 'Refused submissions (bad token, draft or unknown round) and late answers on a closed round', async (s) => {
    const { h, tk, rows } = openRound(s);
    const n = () => rows('responses').length;
    const before = n();
    let j = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: 'AAAAAAAAAAAAAAAAAAAAAA', round: '2026-R1', submission_id: 'sub_bad_token' })), 'bad token');
    s.ok(j && j.ok === false && j.error === 'bad_token', 'a wrong token: { ok: false, error: "bad_token" }', K.show(j));
    j = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001', 'DEMO-R1'), round: 'DEMO-R1', submission_id: 'sub_draft' })), 'draft round');
    s.ok(j && j.ok === false && j.error === 'round_not_open', 'a draft round: round_not_open', K.show(j));
    s.ok(!(H.roundInfo(h, 'DEMO-R1') || {}).sheet_id, 'nothing is created for the draft round');
    j = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001', 'NOPE-R9'), round: 'NOPE-R9', submission_id: 'sub_unknown' })), 'unknown round');
    s.ok(j && j.ok === false && j.error === 'round_not_open', 'an unknown round: round_not_open', K.show(j));
    s.eq(n(), before, 'refused submissions are not stored');
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'closed'], { need: true });
    j = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-005', t: tk('DC-DEMO-005'), round: '2026-R1', submission_id: 'sub_late_0001', audioBytes: 0 })), 'closed round');
    s.ok(j && j.ok === true && j.duplicate === false, 'a closed round still accepts a submission', K.show(j));
    const late = rows('responses').find((x) => x.submission_id === 'sub_late_0001');
    s.eq(late && late.late, true, 'it is stored with late = TRUE');
    H.contractClean(s, h);
  });

  add('D10', 'Size limits: oversized lists, answers and pings are refused; at most 10 stored submissions per DC; voice notes decoded only after the token check', async (s) => {
    const { h, tk, rows } = openRound(s);
    const base = (id) => K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: id, audioBytes: 0 });
    const before = rows('responses').length;
    const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    const cases = [
      ['65 free_text items', Object.assign(base('sub_cap_1'), { free_text: many(65, (i) => ({ item_id: 'x' + i, text: 'junk', audio: null })) })],
      ['65 ratings', Object.assign(base('sub_cap_2'), { ratings: many(65, (i) => ({ block: 'function', item: 'x' + i, rating: 1 })) })],
      ['401 events', Object.assign(base('sub_cap_3'), { events: many(401, (i) => ({ seq: i, screen: 'nps', at: '2026-10-20T00:00:00Z' })) })],
      ['101 answers', Object.assign(base('sub_cap_4'), { answers: Object.fromEntries(many(101, (i) => ['q' + i, 1])) })],
      ['250,000 characters of text', (() => { const b = base('sub_cap_5'); b.free_text[0].text = 'x'.repeat(250000); return b; })()]
    ];
    for (const [label, body] of cases) {
      const j = K.webJson(s, K.webPost(h, body), label);
      s.ok(j && j.ok === false && j.error === 'bad_request' && H.plainEnglish(j.message || ''), `${label}: refused with bad_request in plain English`, K.show(j, 160));
    }
    s.eq(rows('responses').length, before, 'none of the oversized submissions was stored');
    // At most 10 stored submissions per DC and round
    for (let i = 0; i < 12; i++) K.webPost(h, base('sub_flood_' + i));
    const fromDc = rows('responses').filter((r) => r.dc === 'DC-DEMO-001').length;
    s.eq(fromDc, 10, 'one DC can store at most 10 submissions in a round (the rest are answered ok but not stored)');
    // Oversized pings
    const pingCases = [
      ['a 9-letter lang', K.makePing({ dc: 'DC-DEMO-002', round: '2026-R1', t: tk('DC-DEMO-002'), lang: 'xxxxxxxxx' })],
      ['a 200-character screen', K.makePing({ dc: 'DC-DEMO-002', round: '2026-R1', t: tk('DC-DEMO-002'), screen: 'y'.repeat(200) })],
      ['401 events', K.makePing({ stage: 'progress', dc: 'DC-DEMO-002', round: '2026-R1', t: tk('DC-DEMO-002'), events: many(401, (i) => ({ seq: i, screen: 'nps', at: 'x' })) })]
    ];
    for (const [label, body] of pingCases) {
      const j = K.webJson(s, K.webPost(h, body), 'ping with ' + label);
      s.ok(j && j.ok === false && j.error === 'bad_request', `ping with ${label}: refused`, K.show(j, 160));
    }
    // A forged submission with a big recording is refused before anything is decoded
    const forged = K.makeSubmission({ dc: 'DC-DEMO-003', t: 'AAAAAAAAAAAAAAAAAAAAAA', round: '2026-R1', submission_id: 'sub_forged', audioBytes: 2 * 1024 * 1024 });
    const r = K.webPost(h, forged);
    const j = K.webJson(s, r, 'forged submission with a recording');
    s.ok(j && j.error === 'bad_token', 'a forged submission gets bad_token', K.show(j));
    const run = h.state.executions[h.state.executions.length - 1] || {};
    const decoded = run.uses && Array.from(run.uses.keys()).some((k) => /base64Decode/.test(k));
    s.ok(!decoded, 'its recording was never decoded (the token is checked first)', K.show(run.uses ? Array.from(run.uses.keys()).filter((k) => /Utilities/.test(k)) : []));
    // Formula-looking DC names are neutralised in the links CSV
    const ss = h.evaluate('SpreadsheetApp.getActiveSpreadsheet()');
    H.contractClean(s, h);
  });

  add('D11', 'The links CSV neutralises cells that would run as formulas in Excel or Sheets', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const dcs = h.evaluate(`(function(){ const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DCs');
      sh.getRange(2, 1, 2, 6).setValues([['DC-EVIL-001', "'=HYPERLINK(1)", '+SUM(1)', '@risky', 'hi', true],
                                          ['DC-OK-001', 'Plain Name', 'Demo State', 'Demo North', 'en', true]]);
      return true; })()`);
    const res = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: false }]);
    const csv = res && res.csv ? res.csv : '';
    s.ok(csv.indexOf("DC-EVIL-001,'=HYPERLINK(1)") >= 0, 'a DC name starting with = gets a leading apostrophe', K.show(csv, 400));
    s.ok(csv.indexOf("'+SUM(1)") >= 0 && csv.indexOf("'@risky") >= 0, 'cells starting with + and @ are neutralised too', K.show(csv, 400));
    s.ok(csv.indexOf('Plain Name') >= 0 && csv.indexOf("'Plain Name") < 0, 'ordinary cells are unchanged');
    H.contractClean(s, h);
  });

  add('D5', 'Malformed messages are answered bad_request (plain English) and nothing is stored', async (s) => {
    const { h, tk, rows } = openRound(s);
    const good = () => K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_malformed', audioBytes: 0 });
    const withAudio = (audio) => { const b = good(); b.free_text[0].audio = audio; return b; };
    const big = Buffer.alloc(Math.round(5.5 * 1024 * 1024), 7).toString('base64');
    const cases = [
      ['an empty body', ''],
      ['text that is not JSON', 'hello'],
      ['a JSON list', '[1, 2]'],
      ['no "kind"', { foo: 1 }],
      ['schema_version 2', Object.assign(good(), { schema_version: 2 })],
      ['schema_version "1" as text', Object.assign(good(), { schema_version: '1' })],
      ['a submission_id with a space', Object.assign(good(), { submission_id: 'bad id' })],
      ['a submission_id of 65 characters', Object.assign(good(), { submission_id: 's'.repeat(65) })],
      ['a DC id with "/"', Object.assign(good(), { dc: 'DC/1' })],
      ['the DC id ".."', Object.assign(good(), { dc: '..' })],
      ['no round', (() => { const b = good(); delete b.round; return b; })()],
      ['lang that is not text', Object.assign(good(), { lang: 5 })],
      ['answers as a list', Object.assign(good(), { answers: [] })],
      ['ratings as an object', Object.assign(good(), { ratings: {} })],
      ['events missing', (() => { const b = good(); delete b.events; return b; })()],
      ['a free_text item that is not an object', Object.assign(good(), { free_text: ['x'] })],
      ['audio that is not an object', withAudio('abc')],
      ['audio without base64', withAudio({ mime: 'audio/webm', duration_s: 1, bytes: 10 })],
      ['audio as a data: address', withAudio({ mime: 'audio/webm', duration_s: 1, bytes: 10, base64: 'data:audio/webm;base64,GkXfo59C' })],
      ['audio with invalid base64 characters', withAudio({ mime: 'audio/webm', duration_s: 1, bytes: 10, base64: '@@@@' })],
      ['a voice note over 5 MB', withAudio({ mime: 'audio/webm', duration_s: 60, bytes: 5767168, base64: big })],
      ['a message over 25 MB', '{"kind":"submit","pad":"' + 'x'.repeat(26 * 1024 * 1024) + '"}']
    ];
    const before = ['responses', 'function_ratings', 'free_text', 'events'].map((t) => rows(t).length).join();
    for (const [label, body] of cases) {
      const j = K.webJson(s, K.webPost(h, body), label);
      s.ok(j && j.ok === false && j.error === 'bad_request' && H.plainEnglish(j.message), `${label}: bad_request with a plain-English message`, K.show(j));
    }
    const noBody = K.webJson(s, (() => {
      const r = h.exec('doPost', [{ parameter: {}, parameters: {}, queryString: '', contextPath: '', contentLength: -1 }], { context: 'webapp' });
      if (!r.ok) return { threw: true, error: r.error };
      const out = h.admin.unwrapOutput(r.value);
      let json = null;
      try { json = JSON.parse(out.content); } catch (e) { /* reported */ }
      return { json, text: out && out.content, mime: out && out.mime && out.mime.name };
    })(), 'a POST without a body');
    s.ok(noBody && noBody.ok === false && noBody.error === 'bad_request', 'a POST without any body: bad_request', K.show(noBody));
    s.eq(['responses', 'function_ratings', 'free_text', 'events'].map((t) => rows(t).length).join(), before, 'nothing malformed was stored');
    H.contractClean(s, h);
  });

  add('D6', 'A busy script lock answers server_error "busy, try again" (the form retries)', async (s) => {
    const { h, tk, rows } = openRound(s);
    h.control.setLockBusy(true);
    const body = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_busy_0001' });
    let j = K.webJson(s, K.webPost(h, body), 'submit while busy');
    s.eq(j, { ok: false, error: 'server_error', message: 'busy, try again' }, 'busy: { ok: false, error: "server_error", message: "busy, try again" }');
    s.eq(rows('responses').filter((x) => x.submission_id === 'sub_busy_0001').length, 0, 'nothing is stored while busy');
    h.control.setLockBusy(false);
    j = K.webJson(s, K.webPost(h, Object.assign({}, body, { attempt: 2 })), 'retry when free');
    s.ok(j && j.ok === true && j.duplicate === false, 'the retry is stored', K.show(j));
    H.contractClean(s, h);
  });

  add('D7', 'Full data tabs grow automatically; several large voice notes in one submission', async (s) => {
    const { h, bookId, tk, rows } = openRound(s);
    for (const tab of ['responses', 'function_ratings']) {
      const sheet = h.admin.findSheet(bookId, tab);
      const fill = [];
      for (let r = sheet.lastRow() + 1; r <= sheet.maxRows; r += 1) fill.push([`'2026-10-01T00:00:00.000Z`, `sub_filler_${r}`, 'DC-FILL', '2026-R1']);
      if (fill.length) h.admin.writeRange(bookId, tab, sheet.lastRow() + 1, 1, fill);
      s.note(`${tab} filled to its last row (${sheet.maxRows}) before the submission`);
    }
    const audio = K.fakeAudio(1536 * 1024).toString('base64');
    const body = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_big_0001' });
    body.free_text = ['fn_deep_dive:losses', 'fn_deep_dive:app', 'one_fix'].map((id) => ({ item_id: id, block: id === 'one_fix' ? 'one_fix' : 'function',
      function: id === 'one_fix' ? null : id.split(':')[1], issue_code: null, question_key: 'q.tell_more', text: '',
      audio: { mime: id === 'one_fix' ? 'audio/mp4' : 'audio/ogg;codecs=opus', duration_s: 59.5, bytes: 1536 * 1024, base64: audio } }));
    const res = K.webPost(h, body);
    const j = K.webJson(s, res, 'big submission into full tabs');
    s.ok(j && j.ok === true && j.duplicate === false, 'a submission into full tabs is stored (the tabs grow)', K.show(j));
    s.note(`Three 1.5 MB voice notes took ${res.run ? res.run.ms : '?'} ms in the harness.`);
    s.eq(rows('responses').filter((x) => x.submission_id === 'sub_big_0001').length, 1, 'its responses row is there');
    s.eq(rows('function_ratings').filter((x) => x.submission_id === 'sub_big_0001').length, body.ratings.length, 'its function_ratings rows are there');
    const notes = h.admin.drive.items().filter((x) => /sub_big_0001/.test(x.name)).map((x) => x.name).sort();
    s.eq(notes, ['DC-DEMO-001__sub_big_0001__fn_deep_dive-app.ogg', 'DC-DEMO-001__sub_big_0001__fn_deep_dive-losses.ogg', 'DC-DEMO-001__sub_big_0001__one_fix.m4a'],
      'three voice notes saved, named by mime type (.ogg, .m4a)');
    H.contractClean(s, h);
  });

  add('D8', 'Partner texts that look like formulas, numbers, dates or TRUE are stored exactly as typed', async (s) => {
    const { h, tk, rows } = openRound(s);
    const texts = ['=1+1 test', '=HYPERLINK("http://example.org","x")', '007', '2026-10-21', 'TRUE', '+91 98765 43210', '-5', "'quoted"];
    const body = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_text_0001', audioBytes: 0,
      answers: { nps: 0, role: 'captain' } });
    body.free_text = texts.map((text, i) => ({ item_id: `q_text_${i}`, block: 'question', function: null, issue_code: null, question_key: 'q.one_fix', text, audio: null }));
    const j = K.webJson(s, K.webPost(h, body), 'submit with tricky texts');
    s.need(j && j.ok === true, 'stored', K.show(j));
    const ft = rows('free_text').filter((x) => x.submission_id === 'sub_text_0001');
    texts.forEach((text, i) => {
      const got = (ft.find((x) => x.item_id === `q_text_${i}`) || {}).text;
      s.eq(got, text, `the text ${JSON.stringify(text)} is stored exactly (not turned into a formula, number, date or TRUE)`);
    });
    const resp = rows('responses').find((x) => x.submission_id === 'sub_text_0001') || {};
    s.eq(resp.nps, 0, 'an NPS of 0 is stored as 0 (not an empty cell)');
    s.ok(H.blankish(resp.support_contacted), 'support_contacted is empty when the support question was not answered', K.show(resp.support_contacted));
    H.contractClean(s, h);
  });

  add('D9', 'A round marked open whose data spreadsheet is missing gets it on the first write', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const m = H.clone(L.model);
    m.rounds.push({ id: '2026-R5', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'store created lazily' });
    P(h, s, 'panelSave', [L.revision, m], { need: true });
    h.admin.props.script.set('ROUND:2026-R5', JSON.stringify({ status: 'open', sheet_id: '', audio_folder_id: '' }));
    h.admin.cache.clear();
    const secret = H.secretOf(h);
    const j = K.webJson(s, K.webPost(h, K.makePing({ dc: 'DC-DEMO-001', round: '2026-R5', t: K.token(secret, 'DC-DEMO-001', '2026-R5') })), 'ping to a round without a store');
    s.ok(j && j.ok === true, 'the ping is accepted', K.show(j));
    const info = H.roundInfo(h, '2026-R5');
    s.ok(info && info.sheet_id && h.admin.findBook(info.sheet_id), 'the data spreadsheet was created on the first write', K.show(info));
    if (info && info.sheet_id) s.eq((h.admin.table(info.sheet_id, 'pings') || { rows: [] }).rows.length, 1, 'and the ping is in it');
    const row = h.admin.table(null, 'Rounds').rows.find((r) => r.round_id === '2026-R5');
    s.soft(row && row.data_sheet, 'the Rounds tab shows the new data sheet address', K.show(row));
    H.contractClean(s, h);
  });

  // Flow-graph stage 6 (26 Oct 2026, Pranav's decision 11): config_version is the last column of the pings
  // tab, so the dashboard knows which questionnaire a partner who never finished saw. A round spreadsheet
  // made before that day gets the column from its first ping (Code.gs PP_pingsTab_), safely.
  add('D12', 'Pings keep the questionnaire version (config_version) in the last column; a round spreadsheet made before 26 Oct 2026 gets that column safely', async (s) => {
    const { h, bookId, tk } = openRound(s);
    const COL = C.DATA_TABS.pings.indexOf('config_version') + 1;
    s.need(COL > 1 && COL === C.DATA_TABS.pings.length, 'the contract: config_version is the LAST column of the pings tab', K.show(C.DATA_TABS.pings));
    const tab = () => h.admin.findSheet(bookId, 'pings');
    const cell = (r, c) => h.admin.cell(bookId, 'pings', r, c);
    const header = (c) => String(cell(1, c));
    const used = (run, member) => (run.uses && run.uses.get(member)) || 0;
    const marker = () => h.admin.cache.entries().find((e) => e.key === 'pingcols:' + bookId);
    /* One "started" ping (no already-submitted lookup), and the row it landed in. */
    const send = (o) => {
      const res = K.webPost(h, K.makePing(Object.assign({ stage: 'started', dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001') }, o)));
      const j = K.webJson(s, res, 'ping');
      return { j, run: res.run || { uses: new Map(), lockLog: [] }, row: tab().lastRow() };
    };
    /* Make the pings tab look like one made before 26 Oct 2026: it ends with events_json, and the rows
       already in it have no version (as stored before the change). The cache forgets the tab too. */
    const makeOld = () => {
      const sh = tab();
      for (const row of sh.rows) if (row && row.length > COL - 1) row.length = COL - 1;
      sh.maxCols = COL - 1;
      h.admin.cache.remove('pingcols:' + bookId);
    };

    // 1. A spreadsheet made today has the column from the start.
    s.eq(header(COL), 'config_version', 'a new round\'s pings tab ends with the config_version header');
    let p = send({ config_version: 'p1-2026-10-20' });
    s.ok(p.j && p.j.ok === true, 'a ping is accepted', K.show(p.j));
    s.eq(cell(p.row, COL), 'p1-2026-10-20', 'the published version the phone showed is stored in the last column');
    p = send({ config_version: '2026-10-19.1' });
    s.eq(cell(p.row, COL), '2026-10-19.1', 'the version of the form\'s own copy (2026-10-19.1) is stored as text, not as a date or a number');
    p = send({ drop: ['config_version'] });
    s.ok(cell(p.row, 2) === 'started' && H.blankish(cell(p.row, COL)), 'a ping without a version is stored with an empty config_version cell', K.show(cell(p.row, COL)));
    const m = marker();
    s.ok(m && m.value === String(COL) && m.secondsLeft <= 21600, 'the cache remembers (6 hours at most) that this spreadsheet has every pings column', K.show(m));
    p = send({});
    s.ok(used(p.run, 'Sheet.getMaxColumns') === 0 && used(p.run, 'Sheet.insertColumnsAfter') === 0 && p.run.lockLog.length === 0,
      'after that, a ping reads nothing extra and takes no lock', K.show({ uses: Array.from(p.run.uses.keys()), locks: p.run.lockLog }));
    s.eq(tab().maxCols, COL, 'the pings tab is exactly as wide as its columns');

    // 2. A spreadsheet made before 26 Oct 2026: the first ping adds the column.
    makeOld();
    const before = tab().lastRow();
    s.need(tab().maxCols === COL - 1 && header(COL - 1) === 'events_json' && before > 1,
      'set-up: the pings tab now looks like one made before 26 Oct 2026 (it ends with events_json, rows already stored)', K.show({ maxCols: tab().maxCols, last: header(COL - 1) }));
    p = send({ config_version: 'p2-2026-10-26' });
    s.ok(p.j && p.j.ok === true, 'a ping to the old tab is accepted', K.show(p.j));
    s.eq(header(COL), 'config_version', 'the first ping adds the config_version header right after events_json');
    const styles = h.admin.sheetInfo(bookId, 'pings').header;
    s.ok(styles[COL - 1] && styles[COL - 1].fontWeight === 'bold' && styles[COL - 1].background === styles[0].background,
      'in the header style of the other headers (bold, light purple)', K.show(styles[COL - 1]));
    s.eq(tab().maxCols, COL, 'by adding exactly one column');
    s.eq(cell(p.row, COL), 'p2-2026-10-26', 'the ping that added it is stored with its version');
    const olderEmpty = [];
    for (let r = 2; r <= before; r += 1) olderEmpty.push(H.blankish(cell(r, COL)));
    s.ok(olderEmpty.every(Boolean), 'the rows stored before keep an empty config_version cell', K.show(olderEmpty));
    s.eq(p.run.lockLog, ['script:8000', 'script:release'], 'it took the script lock once (waiting 8 s at most) and released it');
    s.eq(used(p.run, 'Sheet.insertColumnsAfter'), 1, 'one column was inserted');
    p = send({ config_version: 'p2-2026-10-26' });
    s.ok(tab().maxCols === COL && cell(p.row, COL) === 'p2-2026-10-26' && p.run.lockLog.length === 0,
      'the next ping adds nothing more and takes no lock', K.show({ maxCols: tab().maxCols, locks: p.run.lockLog }));
    h.admin.cache.remove('pingcols:' + bookId);
    p = send({});
    s.ok(tab().maxCols === COL && used(p.run, 'Sheet.insertColumnsAfter') === 0 && p.run.lockLog.length === 0,
      'when the cache has forgotten, a ping looks again, finds the column and adds nothing', K.show({ maxCols: tab().maxCols, locks: p.run.lockLog }));

    // 3. An admin added a column of their own on the right (allowed): it moves one place right, intact.
    makeOld();
    const own = [['my_note']];
    for (let r = 2; r <= tab().lastRow(); r += 1) own.push([`checked ${r}`]);
    h.admin.writeRange(bookId, 'pings', 1, COL, own);
    p = send({ config_version: 'p3-2026-10-27' });
    s.eq([header(COL), header(COL + 1)], ['config_version', 'my_note'],
      'with a column of the admins\' own after events_json: config_version goes in between, and their column moves one place right');
    const kept = [];
    for (let r = 2; r < own.length + 1; r += 1) kept.push(cell(r, COL + 1) === `checked ${r}` && H.blankish(cell(r, COL)));
    s.ok(kept.every(Boolean), 'every value in the admins\' column is still there, nothing was overwritten', K.show(kept));
    s.ok(cell(p.row, COL) === 'p3-2026-10-27' && H.blankish(cell(p.row, COL + 1)), 'the new ping fills config_version, not the admins\' column',
      K.show([cell(p.row, COL), cell(p.row, COL + 1)]));
    s.eq(tab().maxCols, COL + 1, 'one column was added');

    // 4. The script lock stays busy (many answers being saved): the ping is still stored, without its version.
    makeOld();
    h.control.setLockBusy(true);
    p = send({ config_version: 'p4-2026-10-28' });
    h.control.setLockBusy(false);
    s.ok(p.j && p.j.ok === true && cell(p.row, 2) === 'started', 'while the lock is busy, the ping is still stored', K.show(p.j));
    s.eq(tab().maxCols, COL - 1, 'without adding the column, and without writing past events_json (a cell without a header)');
    s.ok(!marker(), 'and the cache does not claim that the column is there', K.show(marker()));
    const meanwhile = p.row;
    p = send({ config_version: 'p4-2026-10-28' });
    s.ok(header(COL) === 'config_version' && tab().maxCols === COL && cell(p.row, COL) === 'p4-2026-10-28' && H.blankish(cell(meanwhile, COL)),
      'once the lock is free, the next ping adds the column; the ping stored meanwhile keeps an empty cell', K.show({ header: header(COL), maxCols: tab().maxCols }));

    // 5. Two pings at once: the other one adds the column while this one waits for the lock.
    makeOld();
    let raced = false;
    h.control.onTryLock((kind) => {
      if (kind !== 'script' || raced) return;
      raced = true;
      const sh = tab();   // what the other ping leaves behind (PP_addPingVersionColumn_)
      sh.maxCols = COL;
      sh.setRaw(1, COL, 'config_version');
    });
    p = send({ config_version: 'p5-2026-10-29' });
    h.control.onTryLock(null);
    s.need(raced, 'set-up: another ping added the column while this one waited for the lock');
    s.ok(tab().maxCols === COL && header(COL) === 'config_version' && used(p.run, 'Sheet.insertColumnsAfter') === 0,
      'this ping looks again once it has the lock, and adds no second column', K.show({ maxCols: tab().maxCols, inserted: used(p.run, 'Sheet.insertColumnsAfter') }));
    s.eq(cell(p.row, COL), 'p5-2026-10-29', 'and stores its version in the one config_version column');
    H.contractClean(s, h);
  });
};
