/* =============================================================================
   PanelServer.gs  -  Valmo Partner Pulse: what the control panel asks the Sheet to do
   =============================================================================

   WHAT THIS FILE IS
     The control panel (Partner Pulse > Open control panel) is a window inside
     the Sheet. Every time you press a button in it (Save, Publish, Open a
     round, Generate links, ...) the window calls ONE of the "panel..."
     functions below, which does the work in the Sheet and in Google Drive and
     sends back the result. The window's screens themselves are in Panel.html.

   HOW TO INSTALL IT
     In the Apps Script editor this file is a Script file named "PanelServer"
     (paste the contents of apps-script/PanelServer.gs into it). It cannot be called
     "Panel", because Apps Script refuses two files with the same name and
     the HTML file of the panel must be called "Panel".
     Full guide: apps-script/README.md in the GitHub project.

   WHO CAN USE IT
     Only people who can EDIT this Sheet: the panel opens from the Sheet's own
     menu, and every function runs with the permissions of the person using
     it. The public web app (doGet / doPost in Code.gs) cannot reach any of
     these functions.

   WHAT IT READS AND WRITES
     - The questionnaire tabs (through Model.gs: PP_readModel / PP_writeModel).
     - Rounds, DCs, Links, Publish history and _meta tabs.
     - The Drive folder "Valmo Partner Pulse" (published versions, round data).
     - Script Properties: LINK_SECRET, the live version, each round's status,
       PREVIEW_KEY, OWNER_EMAIL, WEB_APP_URL (the web app address, recorded
       by panelSetWebAppUrl after a check) and ROUNDS_EVER_OPENED (set the
       first time a real round opens; from then on codes are locked. Test
       rounds, whose id starts with SMOKE, DEMO or TEST, never set it).
     - The User Property "panel_section" (which section the panel opens on).

   RULES EVERY FUNCTION HERE FOLLOWS (contract: docs/control-panel-design.md,
   section 13)
     - It returns plain data only (text, numbers, true/false, lists): dates are
       sent as text such as 2026-10-21T08:30:00.000Z.
     - When something goes wrong it stops with a message in plain English that
       says what happened and what to do; the panel shows that message. A
       missing Google permission is explained the same way (PP_forPanel_).
     - Changes wait for each other (the Sheet's DOCUMENT lock), so two people
       saving or publishing at the same moment never overwrite each other by
       accident. Partners' answers use another lock, so admins and partners
       never wait for each other. Only creating a round's data spreadsheet
       also takes the partners' lock, for a moment (Code.gs, PP_withStoreLock_).
     - Codes (of questions, areas, problems, support questions, answer
       options) are locked only once a real round has been opened: before that
       no partner can have answered, so the placeholder questionnaire can be
       replaced freely (panelLoad's codes_locked). Test rounds (SMOKE..., DEMO...,
       TEST...) never lock them (Code.gs, PP_isTestRound_).

   SAFETY
     - panelGetSecret only shows the link secret after the person typed SHOW.
       Anyone holding the secret can make a valid link for any DC: never paste
       it into chats, emails or files.
     - The DC list and the links are partner data: they stay in this Sheet.
   ============================================================================= */


// =============================================================================
// Opening the panel and loading everything it shows
// =============================================================================

/**
 * Menu: shows the control panel window. If a Google permission was left
 * unticked, Google shows its permission screen again first (Code.gs,
 * PP_requireAllPermissions_).
 */
function panelOpen() {
  PP_requireAllPermissions_();
  const html = HtmlService.createHtmlOutputFromFile('Panel')
    .setWidth(1100)
    .setHeight(760)
    .setTitle('Partner Pulse control panel');
  SpreadsheetApp.getUi().showModalDialog(html, 'Partner Pulse control panel');
}

/**
 * Everything the panel needs when it opens: the draft questionnaire (the
 * "model"), the catalogue of settings and screen types, the live version,
 * the codes partners already answered (they cannot be renamed), counts and
 * useful addresses.
 *   codes_locked          true once any real round has been opened (Code.gs,
 *                         PP_codesLocked_; test rounds don't count). Before
 *                         that live_ids is empty: nothing is locked yet.
 *   live_ids_unknown      true when codes are locked but the live codes
 *                         can't be read: Google Drive had a passing problem
 *                         reading the live version, or a real round was
 *                         opened before anything was published (partners
 *                         then answer with the form's own copy). Either way
 *                         the panel keeps every existing code locked.
 *   web_app_url           the /exec address recorded with panelSetWebAppUrl
 *                         ('' until someone records it)
 *   web_app_url_recorded  true when there is one
 *   web_app_access        "anyone", "domain" (open only to people signed in
 *                         with a company account: Meesho-only mode, where
 *                         links and Preview open through the web app), or ''
 * When Google Drive refuses this person the published version (it is not in
 * the short-term cache any more), the panel stops with the plain "ask the
 * owner to share the Drive folder" message instead of opening as if nothing
 * was published.
 */
function panelLoad() {
  return PP_forPanel_(() => {
    const ss = PP_panelBook_();
    const model = PP_readModel(ss);
    const live = PP_liveDocForAdmin_();
    const locked = PP_codesLocked_();
    const dcs = PP_dcCounts_(ss);
    const webAppUrl = PP_webAppUrl_();
    return PP_plain_({
      revision: PP_revisionOf_(PP_readMeta_(ss)),
      model: model,
      catalog: {
        settings_schema: PP_SETTINGS_SCHEMA,
        screen_types: PP_SCREEN_TYPES,
        form_text_keys: PP_FORM_TEXT_KEYS
      },
      live: PP_liveSummary_(ss, live),
      live_ids: PP_liveIdsOf_(locked ? live : null),
      live_ids_unknown: Boolean(locked && !live),
      codes_locked: locked,
      draft_differs_from_live: PP_draftDiffersFromLive_(model, live),
      user: PP_currentUser_(),
      spreadsheet_url: ss.getUrl(),
      folder_url: PP_folderUrl_(),
      web_app_url: webAppUrl,
      web_app_url_recorded: Boolean(webAppUrl),
      web_app_access: PP_webAppAccess_(),
      dc_count: dcs.total,
      active_dc_count: dcs.active,
      open_section: PP_takeOpenSection_()
    });
  });
}


// =============================================================================
// Saving, checking and publishing the draft
// =============================================================================

/**
 * Saves the whole draft. Refused (nothing written) when someone else saved
 * since this panel loaded: the answer then says who, so the panel can offer
 * "Reload the latest version" or "Keep mine and overwrite".
 */
function panelSave(baseRevision, model) {
  return PP_forPanel_(() => {
    PP_requireModelShape_(model);
    const ss = PP_panelBook_();
    const user = PP_currentUser_();
    return PP_plain_(PP_withAdminLock_(() => {
      const conflict = PP_revisionConflict_(ss, baseRevision);
      if (conflict) return conflict;
      const draft = PP_prepareDraft_(ss, model);
      PP_writeModel(ss, draft, PP_SRV.ALL_SECTIONS);
      const revision = PP_bumpRevision_(ss, user);
      // The save is done: a Drive problem here must not look like a failed save.
      return { ok: true, revision: revision,
        draft_differs_from_live: PP_draftDiffersFromLive_(draft, PP_liveDocOrNull_()) };
    }));
  });
}

/**
 * Tidies the draft sent by the panel before it is written:
 *   - PP_normalizeModel (Model.gs) gives every field its proper type;
 *   - the translation helpers mark texts still to translate (see the contract,
 *     panelSave), comparing with the draft as it was saved before;
 *   - rounds keep the status and data links that only the script may change.
 */
function PP_prepareDraft_(ss, model) {
  const previous = PP_readModel(ss);
  const draft = PP_normalizedCopy_(model);
  // Model.gs: the OLD model (as saved before) comes first, the new one second.
  const helped = PP_applyTranslationHelpers(previous, draft, PP_todayInIndia_()) || draft;
  helped.rounds = PP_settleRounds_(helped.rounds, previous.rounds);
  return helped;
}

/** A tidied copy of the model sent by the panel (the panel's own copy is never changed). */
function PP_normalizedCopy_(model) {
  const copy = PP_plain_(model);
  return PP_normalizeModel(copy) || copy;
}

/**
 * Checks a draft (as it is in the panel, saved or not) and lists errors and
 * warnings. The "a code partners answered is missing" warnings only start
 * once a round has been opened (Code.gs, PP_liveDocForChecks_).
 */
function panelValidate(model) {
  return PP_forPanel_(() => {
    PP_requireModelShape_(model);
    return PP_plain_(PP_validate(PP_normalizedCopy_(model), PP_liveDocForChecks_()));
  });
}

/**
 * Publishes the SAVED draft (the panel saves first). Answers
 * { ok: true, version, config_version }, or { ok: false, errors } when the
 * draft has problems, or a "someone else saved" conflict like panelSave.
 */
function panelPublish(baseRevision, note) {
  return PP_forPanel_(() => {
    const ss = PP_panelBook_();
    const user = PP_currentUser_();
    return PP_plain_(PP_withAdminLock_(() => {
      const conflict = PP_revisionConflict_(ss, baseRevision);
      if (conflict) return conflict;
      return PP_publish(ss, note, user);
    }));
  });
}

/** Every published version, newest first. */
function panelHistory() {
  return PP_forPanel_(() => {
    const entries = PP_historyEntries_(PP_panelBook_());
    entries.sort((a, b) => b.version - a.version);
    return PP_plain_(entries.map(entry => ({
      version: entry.version, config_version: entry.config_version, published_at: entry.published_at,
      published_by: entry.published_by, note: entry.note, live: entry.live, file: entry.file
    })));
  });
}

/** Brings an old version back as the draft (it is NOT published: review it, then publish). */
function panelRestore(version) {
  return PP_forPanel_(() => {
    const ss = PP_panelBook_();
    return PP_plain_(PP_withAdminLock_(() => PP_restore(ss, version)));
  });
}


// =============================================================================
// Rounds
// =============================================================================

/**
 * Opens, closes or re-opens a round (or puts it back to draft). Takes effect
 * at once for partners. The first time a round is opened it gets its own
 * data spreadsheet and voice-note folder. The first time a real round is
 * opened, the codes are locked for good (ROUNDS_EVER_OPENED); test rounds
 * (SMOKE..., DEMO..., TEST...: PP_isTestRound_) never lock them. Opening a
 * round whose name contains DEMO needs confirmDemo = true, because DEMO
 * rounds hold fake content.
 */
function panelSetRoundStatus(roundId, status, confirmDemo) {
  return PP_forPanel_(() => {
    const id = PP_text_(roundId);
    if (PP_SRV.ROUND_STATUSES.indexOf(status) < 0) {
      throw new Error('"' + status + '" is not a round status. Use draft, open or closed.');
    }
    const ss = PP_panelBook_();
    PP_requireKnownRound_(ss, id);
    // Opening needs the checks' rule (no dots): an open round can't be dropped
    // from the Rounds tab, and a name the checks refuse would block every
    // Publish (21 Oct review). Closing an older round only needs a usable id.
    if ((status === 'open' && !PP_SRV.ROUND_RULE.test(id)) || !PP_isDcOrRound_(id)) {
      throw new Error('The round "' + id + '" has a name that is not allowed. Use 1 to 64 letters, digits, - or _ ' +
        '(no spaces or dots), exactly as in the partner links, for example "2026-R1". Add a round with such a name instead.');
    }
    if (status === 'open' && /demo/i.test(id) && confirmDemo !== true) {
      throw new Error('"' + id + '" is a DEMO round: its content is fake. Opening it lets partners answer ' +
        'it. Confirm the warning to open it anyway.');
    }
    return PP_plain_(PP_withAdminLock_(() => {
      const wasLocked = PP_codesLocked_();   // read before the change (a round open or closed today)
      PP_withStoreLock_(() => PP_saveRoundStatus_(id, status));
      // Recorded only once a real round really opened (test rounds never lock
      // the codes); codes that were already locked stay locked even if that
      // round goes back to draft.
      if ((status === 'open' && !PP_isTestRound_(id)) || wasLocked) PP_recordRoundsOpened_();
      PP_writeRoundCells_(id, { status: status });
      return { ok: true, round: PP_roundRows_(ss).filter(round => round.id === id)[0] };
    }));
  });
}

/**
 * Runs while holding the partners' lock too (PP_withStoreLock_): a partner's
 * first answer may be creating the same round's store and saving its record
 * at this very moment. Creates the store on the first opening.
 */
function PP_saveRoundStatus_(id, status) {
  let info = PP_readRoundProp_(id) || { status: 'draft', sheet_id: '', audio_folder_id: '' };
  if (status === 'open' && !(info.sheet_id && info.audio_folder_id)) info = PP_ensureRoundStore_(id);
  info.status = status;
  PP_saveRoundProp_(id, info);
  return info;
}

/**
 * How far a round has got: links made, and distinct DCs that opened the
 * form, started answering and submitted. Each step includes the DCs of the
 * later steps (a DC that submitted also counts as opened and started, even
 * if its earlier signals were lost on a weak network).
 * by_lang counts each DC once, in the language of its latest submission.
 */
function panelRoundCounts(roundId) {
  return PP_forPanel_(() => {
    const ss = PP_panelBook_();
    const id = PP_text_(roundId);
    const counts = { links: PP_countLinks_(ss, id), opened: 0, started: 0, submitted: 0, by_lang: {},
      last_submission_at: null };
    const info = PP_isDcOrRound_(id) ? PP_readRoundProp_(id) : null;
    if (!info || !info.sheet_id) return counts;
    PP_countAnswers_(PP_openBook_(info.sheet_id, 'the data spreadsheet of round ' + id), counts);
    return PP_plain_(counts);
  });
}

/** Fills counts from a round's data spreadsheet (pings and responses tabs). */
function PP_countAnswers_(book, counts) {
  const opened = Object.create(null);
  const started = Object.create(null);
  const latest = Object.create(null);
  PP_readDataColumns_(book, 'pings', ['stage', 'dc']).forEach(ping => {
    if (!ping.dc) return;
    opened[ping.dc] = true;
    if (ping.stage === 'started') started[ping.dc] = true;
  });
  PP_readDataColumns_(book, 'responses', ['received_at', 'dc', 'lang']).forEach(response => {
    if (!response.dc) return;
    opened[response.dc] = true;
    started[response.dc] = true;
    const before = latest[response.dc];
    if (!before || response.received_at >= before.received_at) latest[response.dc] = response;
  });
  counts.opened = Object.keys(opened).length;
  counts.started = Object.keys(started).length;
  counts.submitted = Object.keys(latest).length;
  Object.keys(latest).forEach(dc => {
    const lang = latest[dc].lang || 'unknown';
    counts.by_lang[lang] = (counts.by_lang[lang] || 0) + 1;
    if (!counts.last_submission_at || latest[dc].received_at > counts.last_submission_at) {
      counts.last_submission_at = latest[dc].received_at;
    }
  });
}

/** Some columns of a data tab, as [{ column: text }], read with one call. */
function PP_readDataColumns_(book, tab, names) {
  const sheet = book.getSheetByName(tab);
  const lastRow = sheet ? sheet.getLastRow() : 0;
  if (lastRow < 2) return [];
  const positions = names.map(name => PP_DATA_TABS[tab].indexOf(name));
  const first = Math.min.apply(null, positions);
  const last = Math.max.apply(null, positions);
  const values = sheet.getRange(2, first + 1, lastRow - 1, last - first + 1).getValues();
  return values.map(row => {
    const item = {};
    names.forEach((name, i) => { item[name] = PP_isoText_(row[positions[i] - first]); });
    return item;
  });
}


// =============================================================================
// Links
// =============================================================================

/**
 * Makes a personal link for every ACTIVE DC in the DCs tab, for one round,
 * and keeps them in the Links tab (one row per DC per round).
 * options.only_missing (default true): DCs that already have a link keep it.
 * With only_missing = false every link is made again (the same secret gives
 * the same link, so links already sent keep working).
 * Answers { ok, created, updated, kept, skipped: [{ dc_id, reason }], csv };
 * csv lists the round's links for all active DCs.
 */
function panelGenerateLinks(roundId, options) {
  return PP_forPanel_(() => {
    const ss = PP_panelBook_();
    const id = PP_text_(roundId);
    PP_requireKnownRound_(ss, id);
    if (!PP_isDcOrRound_(id)) {
      throw new Error('The round name "' + id + '" can only use letters, digits, "-", "_" or "." ' +
        '(at most 64 characters), so it cannot be used in links.');
    }
    const model = PP_readModel(ss);
    const job = {
      roundId: id,
      onlyMissing: !(options && options.only_missing === false),
      formUrl: PP_linkBaseUrl_(model.settings || {}),
      secret: PP_requireSecret_(),
      languages: (model.languages || []).filter(lang => lang.active !== false).map(lang => lang.code),
      user: PP_currentUser_(),
      now: PP_nowIso_()
    };
    return PP_plain_(PP_withAdminLock_(() => PP_upsertLinks_(ss, job)));
  });
}

/** Updates the Links tab for one round (one read, one write). */
function PP_upsertLinks_(ss, job) {
  const sheet = PP_requireSheet_(ss, 'Links');
  const table = PP_readTable_(sheet);
  PP_requireColumns_(table, ['round_id', 'dc_id', 'dc_name', 'state', 'region', 'language', 'link',
    'generated_at', 'generated_by'], 'Links');
  const existing = PP_linkRowsOfRound_(table, job.roundId);
  const result = { ok: true, created: 0, updated: 0, kept: 0, skipped: [] };
  const csvRows = [];
  const seen = Object.create(null);
  PP_dcRows_(ss).forEach(dc => {
    if (!dc.active) return;
    const problem = dc.typed_problem || PP_dcProblem_(dc.dc_id, seen);
    if (problem) {
      result.skipped.push({ dc_id: dc.dc_id, reason: problem });
      return;
    }
    seen[dc.dc_id] = true;
    csvRows.push(PP_upsertOneLink_(table, existing[dc.dc_id], dc, job, result));
  });
  PP_writeTableRows_(sheet, table);
  result.csv = PP_linksCsv_(csvRows);
  return result;
}

/** { dc_id: row } for the rows of the Links tab that belong to this round. */
function PP_linkRowsOfRound_(table, roundId) {
  const rows = Object.create(null);
  table.rows.forEach(row => {
    if (PP_text_(row[table.col.round_id]) === roundId) rows[PP_text_(row[table.col.dc_id])] = row;
  });
  return rows;
}

/** Creates, refreshes or keeps one DC's link. Returns that DC's line for the CSV. */
function PP_upsertOneLink_(table, row, dc, job, result) {
  const col = table.col;
  // Keep a stored link only if it opens the address links use now: after a switch to or from
  // Meesho-only mode (PP_linkBaseUrl_) every link is made again, even with "only missing".
  if (row && job.onlyMissing && PP_text_(row[col.link]).indexOf(job.formUrl + '?') === 0) {
    result.kept += 1;
    return { dc_id: dc.dc_id, dc_name: PP_text_(row[col.dc_name]), state: PP_text_(row[col.state]),
      region: PP_text_(row[col.region]), language: PP_text_(row[col.language]), link: PP_text_(row[col.link]) };
  }
  const language = job.languages.indexOf(dc.language) >= 0 ? dc.language : '';   // unknown language: ignored
  const values = { round_id: job.roundId, dc_id: dc.dc_id, dc_name: dc.dc_name, state: dc.state,
    region: dc.region, language: language, link: PP_partnerLink_(job, dc.dc_id, language),
    generated_at: job.now, generated_by: job.user };
  if (row) {
    Object.keys(values).forEach(name => { row[col[name]] = values[name]; });
    result.updated += 1;
  } else {
    table.rows.push(PP_rowFromObject_(table, values));
    result.created += 1;
  }
  return values;
}

/** A partner's personal link (contract section 13, panelGenerateLinks). */
function PP_partnerLink_(job, dcId, language) {
  return job.formUrl + '?dc=' + encodeURIComponent(dcId) + '&t=' + PP_linkToken_(job.secret, dcId, job.roundId) +
    '&round=' + encodeURIComponent(job.roundId) + (language ? '&lang=' + language : '');
}

/** Why a DC id cannot get a link, or '' when it is fine. */
function PP_dcProblem_(dcId, seen) {
  if (!PP_isDcOrRound_(dcId)) {
    return 'The DC id can only use letters, digits, "-", "_" or "." and be at most 64 characters. ' +
      'Fix it in the DCs tab.';
  }
  if (seen[dcId]) return 'This DC id is in the DCs tab more than once. Only its first row got a link.';
  return '';
}

/**
 * The DCs tab as simple objects (rows without a dc_id are left out).
 * typed_problem: why the id cannot get a link because Google Sheets turned
 * what was typed into a number or a date (0123 becomes 123, 1-2 becomes a
 * date), or '' when the cell holds text. The id would then not be the one
 * the DC really has, so such a row is skipped with this reason.
 */
function PP_dcRows_(ss) {
  const sheet = PP_requireSheet_(ss, 'DCs');
  const table = PP_readTable_(sheet);
  PP_requireColumns_(table, ['dc_id'], 'DCs');
  const get = (row, name) => (PP_own_(table.col, name) ? row[table.col[name]] : '');
  return table.rows.map(row => {
    const id = get(row, 'dc_id');
    const typedWrong = typeof id === 'number' || id instanceof Date;
    return {
      dc_id: id instanceof Date ? PP_dateText_(id) : PP_text_(id),
      typed_problem: typedWrong ? PP_DC_TYPED_AS_NUMBER_ : '',
      dc_name: PP_text_(get(row, 'dc_name')),
      state: PP_text_(get(row, 'state')),
      region: PP_text_(get(row, 'region')),
      language: PP_text_(get(row, 'language')).toLowerCase(),
      active: PP_isTicked_(get(row, 'active'), true)    // an empty cell counts as active
    };
  }).filter(dc => dc.dc_id);
}

/** The reason given for a DC id that Google Sheets turned into a number or a date. */
const PP_DC_TYPED_AS_NUMBER_ = 'Type the id as text: Google Sheets changed it into a number or a date. ' +
  'In the DCs tab, type it again with an apostrophe in front, for example \'0123, then make the links again.';

/** How many DCs the DCs tab lists, and how many of them are active. */
function PP_dcCounts_(ss) {
  if (!ss.getSheetByName('DCs')) return { total: 0, active: 0 };
  const dcs = PP_dcRows_(ss);
  return { total: dcs.length, active: dcs.filter(dc => dc.active).length };
}

/** How many links the Links tab holds for a round. */
function PP_countLinks_(ss, roundId) {
  const sheet = ss.getSheetByName('Links');
  if (!sheet) return 0;
  const table = PP_readTable_(sheet);
  if (!PP_own_(table.col, 'round_id')) return 0;
  return table.rows.filter(row => PP_text_(row[table.col.round_id]) === roundId).length;
}

/** The links as CSV text: dc_id, dc_name, state, region, language, link. */
function PP_linksCsv_(rows) {
  const columns = ['dc_id', 'dc_name', 'state', 'region', 'language', 'link'];
  const quote = value => {
    let text = PP_text_(value);
    // A cell starting with = + - @ (or a tab / line break) would run as a
    // formula when the file is opened in Excel or Google Sheets, and a hostile
    // DC name could then send the links elsewhere. A leading ' keeps it text.
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return [columns.join(',')].concat(rows.map(row => columns.map(name => quote(row[name])).join(','))).join('\n') + '\n';
}

/**
 * The preview link of the SAVED draft for one round. Nothing answered in a
 * preview is ever saved.
 */
function panelPreviewUrl(roundId) {
  return PP_forPanel_(() => {
    const id = PP_text_(roundId);
    if (!PP_isDcOrRound_(id)) throw new Error('Choose the round to preview first.');
    const settings = PP_readModel(PP_panelBook_()).settings || {};
    const formUrl = PP_linkBaseUrl_(settings);
    const language = PP_text_(settings.default_language) || 'en';
    return { url: formUrl + '?preview=1&dc=DC-PREVIEW&round=' + encodeURIComponent(id) +
      '&lang=' + encodeURIComponent(language) + '&pk=' + encodeURIComponent(PP_previewKey_(true)) };
  });
}

/**
 * Makes a new private preview key: every preview link made before stops
 * working. For when a preview link was shared too widely.
 */
function panelNewPreviewKey() {
  return PP_forPanel_(() => PP_withAdminLock_(() => {
    PP_setScriptProp_(PP_SRV.KEYS.PREVIEW_KEY, Utilities.getUuid().replace(/-/g, ''));
    return { ok: true };
  }));
}

/**
 * The link secret, for scripts/generate_links.py. Only after the person
 * typed SHOW: the secret lets anyone make a valid link for any DC.
 */
function panelGetSecret(confirm) {
  return PP_forPanel_(() => {
    if (confirm !== 'SHOW') throw new Error('To see the link secret, type SHOW (in capital letters) and try again.');
    return { secret: PP_requireSecret_() };
  });
}


// =============================================================================
// Import, export and the two addresses (the form, and the web app)
// =============================================================================

/**
 * Replaces the draft with the questionnaire from the GitHub project (the four
 * files in web/). Rounds that already exist keep their status and data links.
 */
function panelImport(baseUrl) {
  return PP_forPanel_(() => {
    const result = PP_importFromAddress_(PP_panelBook_(), baseUrl, PP_currentUser_());
    return PP_plain_({ ok: true, revision: result.revision, counts: result.counts });
  });
}

/**
 * The four files of the GitHub copy, made from the saved draft (for
 * "Download files"). When the draft is exactly the live version, the files
 * carry the live version's name (for example p7-2026-10-21), so answers sent
 * while the form uses this back-up copy still say which questionnaire it was.
 * survey.json gets the web app address recorded in the panel. While none is
 * recorded, survey.json keeps the form in test mode ("mock", so it still
 * passes the settings check) and the answer has a "warning" saying what to do.
 */
function panelExport() {
  return PP_forPanel_(() => {
    const model = PP_readModel(PP_panelBook_());
    const live = PP_liveDocForAdmin_();
    const webAppUrl = PP_webAppUrl_();
    const companyOnly = PP_webAppAccess_() === 'domain';
    const options = { apps_script_url: companyOnly ? '' : webAppUrl };
    if (live && !PP_draftDiffersFromLive_(model, live)) options.config_version = live.config_version;
    const answer = { files: PP_exportStatic(model, options) };
    if (companyOnly) {
      answer.warning = 'The web app is open only to people signed in with a company account (Meesho-only ' +
        'mode), so survey.json keeps the form in test mode ("mock"): partners can\'t use the form on GitHub ' +
        'Pages yet. Once "Who has access" is "Anyone", click Check and save again, then prepare the files again.';
    } else if (!webAppUrl) {
      answer.warning = 'No web app address is recorded yet, so survey.json keeps the form in test mode ' +
        '("mock"): with these files the form would not send answers to Google. Deploy the web app, paste ' +
        'its address (ending in /exec) into Home > Quick links or Settings, click Check and save, then ' +
        'prepare the files again.';
    }
    return PP_plain_(answer);
  });
}

/** Saves the form address (Settings > form_url) used for links and Preview. */
function panelSetFormUrl(url) {
  return PP_forPanel_(() => {
    const clean = PP_cleanFormUrl_(url);
    const ss = PP_panelBook_();
    const user = PP_currentUser_();
    return PP_plain_(PP_withAdminLock_(() => {
      const model = PP_readModel(ss);
      model.settings = Object.assign({}, model.settings, { form_url: clean });
      PP_writeModel(ss, model, ['settings']);
      return { ok: true, form_url: clean, revision: PP_bumpRevision_(ss, user) };
    }));
  });
}

/**
 * Records the web app's public address (Script Property WEB_APP_URL), after
 * checking it: it must be a web app address ending in /exec (a company-style
 * …/a/macros/<domain>/s/… address is turned into the plain one, which never
 * asks partners to sign in), and asking it ?action=health from outside, as a
 * partner's phone would, must get this project's answer. Google's own idea
 * of the address (ScriptApp.getService().getUrl()) is not used: it is often
 * the editors-only /dev address or an old deployment that no longer works.
 * Answers { ok: true, web_app_url }; otherwise stops with what to fix.
 */
function panelSetWebAppUrl(url) {
  return PP_forPanel_(() => {
    const clean = PP_cleanWebAppUrl_(url);
    const access = PP_checkWebApp_(clean);
    PP_setScriptProp_(PP_SRV.KEYS.WEB_APP_URL, clean);
    PP_setScriptProp_(PP_SRV.KEYS.WEB_APP_ACCESS, access);
    return { ok: true, web_app_url: clean, web_app_access: access };
  });
}

/**
 * How the recorded web app may be opened: "anyone" (partners' phones can use
 * it), "domain" (only people signed in with a company account: Meesho-only
 * mode, 21 Oct 2026), or '' when no address is recorded.
 */
function PP_webAppAccess_() {
  if (!PP_webAppUrl_()) return '';
  return PP_text_(PP_props_()[PP_SRV.KEYS.WEB_APP_ACCESS]) === 'domain' ? 'domain' : 'anyone';
}

/**
 * Where partner links and Preview links point: the form on GitHub Pages
 * (Settings > form_url), or, while the web app is Meesho-only, the web app's
 * own address, which serves the survey page to signed-in colleagues
 * (Code.gs, PP_formPage_). Make the links again after switching.
 */
function PP_linkBaseUrl_(settings) {
  const formUrl = PP_requireFormUrl_(settings);
  return PP_webAppAccess_() === 'domain' ? PP_webAppUrl_() : formUrl;
}


// =============================================================================
// Small building blocks used by the panel functions
// =============================================================================

/**
 * Runs the work of a panel function. When Google refuses because one of its
 * permissions is missing, the panel shows the plain way to fix it (use the
 * Partner Pulse menu again and tick "Select all": Code.gs, PP_permissionHelp_)
 * instead of Google's technical message. Every other problem passes through
 * unchanged.
 */
function PP_forPanel_(work) {
  try {
    PP_requireAdminCaller_();   // Code.gs: only people who can edit the Sheet (21 Oct 2026, Meesho-only mode)
    return work();
  } catch (err) {
    throw PP_permissionError_(err) || err;
  }
}

/** The control Sheet, after checking that set-up has created its main tabs. */
function PP_panelBook_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const missing = ['Settings', 'Screens', 'Texts', 'Rounds', '_meta'].filter(name => !ss.getSheetByName(name));
  if (missing.length) {
    throw new Error('Some tabs are missing (' + missing.join(', ') + '). Close this window and run ' +
      'Partner Pulse > Set up or repair, then open the control panel again.');
  }
  return ss;
}

/** Stops with a plain message when the panel sent something that is not a whole questionnaire. */
function PP_requireModelShape_(model) {
  const lists = ['languages', 'areas', 'chips', 'support', 'screens', 'rounds'];
  const looksRight = PP_isPlainObject_(model) && PP_isPlainObject_(model.settings) &&
    PP_isPlainObject_(model.texts) && lists.every(name => Array.isArray(model[name]));
  if (!looksRight) {
    throw new Error('The control panel sent an incomplete questionnaire, so nothing was changed. ' +
      'Close the panel, open it again and redo the last change.');
  }
}

/** A round that must be listed in the Rounds tab. */
function PP_requireKnownRound_(ss, roundId) {
  if (!roundId) throw new Error('Choose a round first.');
  const known = PP_roundRows_(ss).some(round => round.id === roundId);
  if (!known) {
    throw new Error('There is no round called "' + roundId + '" in the Rounds list. Add it in the ' +
      'control panel (Rounds > New round), press Save, then try again.');
  }
}

/** The link secret; stops with a plain message when set-up has not created it yet. */
function PP_requireSecret_() {
  const secret = PP_props_()[PP_SRV.KEYS.SECRET];
  if (!secret) throw new Error('There is no link secret yet. Run Partner Pulse > Set up or repair first.');
  return secret;
}

/** The form address from the settings, checked (https://..., ending with /). */
function PP_requireFormUrl_(settings) {
  const url = PP_text_(settings.form_url);
  if (!/^https:\/\/[^\s"'<>?#]+\/$/.test(url)) {
    throw new Error('The form address is missing or not valid. Set it in the control panel: ' +
      'Settings > Form address (for example https://pranavakellaps37.github.io/NPS-Form-/).');
  }
  return url;
}

/** A form address typed by a person: must be https://, gets its final "/" if it lacks one. */
function PP_cleanFormUrl_(url) {
  const text = PP_text_(url);
  if (!/^https:\/\/[^\s"'<>?#]+$/.test(text)) {
    throw new Error('The form address must start with https:// and contain no spaces, "?" or "#". ' +
      'Example: https://pranavakellaps37.github.io/NPS-Form-/');
  }
  return text.charAt(text.length - 1) === '/' ? text : text + '/';
}

/**
 * A web app address pasted by a person, checked and turned into the plain
 * form https://script.google.com/macros/s/<id>/exec. The company form
 * (…/a/macros/<domain>/s/<id>/exec) becomes the plain one: partners are not
 * signed in to the company's Google account, so only the plain one works for them.
 */
function PP_cleanWebAppUrl_(url) {
  const text = PP_text_(url);
  const where = ' In the Apps Script editor: Deploy > Manage deployments, then copy the "Web app" URL ' +
    '(it starts with https://script.google.com/ and ends with /exec).';
  if (!text) throw new Error('Paste the web app address first.' + where);
  if (/\/dev\/?$/.test(text.split(/[?#]/)[0])) {
    throw new Error('This is the test address (it ends in /dev): it only works for people who can edit ' +
      'the script, never for partners.' + where);
  }
  if (/googleusercontent\.com/i.test(text)) {
    throw new Error('This is the address Google forwards to after opening the web app, not the web app ' +
      'address itself.' + where);
  }
  const match = PP_SRV.WEB_APP_URL_RULE.exec(text);
  if (!match) {
    throw new Error('That is not a web app address. It must look like ' +
      'https://script.google.com/macros/s/AKfy…/exec, with nothing after /exec.' + where);
  }
  return 'https://script.google.com/macros/s/' + match[1] + '/exec';
}

/**
 * Asks the address for ?action=health exactly as a partner's phone would
 * (without signing in, following Google's redirect) and stops with a plain
 * explanation unless the answer is this project's:
 * { ok: true, service: "valmo-partner-pulse", ... }.
 */
function PP_checkWebApp_(url) {
  const plain = PP_fetchHealth_(url, false);
  if (plain.answer) return 'anyone';
  if (plain.code === 401 || plain.code === 403 || PP_isSignInPage_(plain.text)) {
    // Maybe "Anyone within <company>" (Meesho-only mode): ask again, signed in as the person using the panel.
    let signedIn = null;
    let failure = '';
    try {
      signedIn = PP_fetchHealth_(url, true);
    } catch (err) {
      failure = PP_rawErrorText_(err);
    }
    if (signedIn && signedIn.answer && signedIn.answer.form_page === true) return 'domain';
    if (signedIn && signedIn.answer) {
      throw new Error('This web app is open only to signed-in colleagues, but it still runs older code that can\'t ' +
        'show them the survey. In the Apps Script editor: Deploy > Manage deployments > pencil icon (Edit) > Version: ' +
        'New version > Deploy. The address stays the same: then press "Check and save" again.');
    }
    throw new Error('The web app asks visitors to sign in, and the panel couldn\'t confirm it as this Sheet\'s web app ' +
      'when it asked again signed in as you (' + (failure ? 'Google said: ' + failure : 'it answered ' +
      (signedIn ? signedIn.code : '?')) + '). For partners, "Who has access" must be "Anyone". For colleagues only ' +
      '(Meesho-only mode), use "Anyone within" your company, with "Execute as: Me", and deploy this Sheet\'s latest ' +
      'code: Deploy > Manage deployments > pencil icon (Edit) > Version: New version > Deploy. The address stays the ' +
      'same: then press "Check and save" again.');
  }
  throw new Error(PP_webAppProblem_(url, plain.code, plain.text, plain.json));
}

/** Asks an address for ?action=health, optionally signed in as the person running this. */
function PP_fetchHealth_(url, signedIn) {
  const options = { muteHttpExceptions: true, followRedirects: true };
  if (signedIn) options.headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  let response;
  try {
    response = UrlFetchApp.fetch(url + '?action=health', options);
  } catch (err) {
    const permission = PP_permissionError_(err);
    if (permission) throw permission;
    throw new Error('Could not reach ' + url + ' (Google said: ' + PP_rawErrorText_(err) + '). Check that ' +
      'you copied the whole address, then try again in a minute.');
  }
  const code = response.getResponseCode();
  const text = String(response.getContentText() || '');
  const json = PP_jsonOrNull_(text);
  const answer = json && json.ok === true && json.service === PP_SRV.SERVICE_NAME ? json : null;
  return { code: code, text: text, json: json, answer: answer };
}

/** Why an address did not answer as the Partner Pulse web app, in plain English. */
function PP_webAppProblem_(url, code, text, answer) {
  if (code === 404) {
    return 'There is no web app at ' + url + ' (the server answered 404). Check that you copied the whole ' +
      'address, and that this deployment still exists (Deploy > Manage deployments).';
  }
  if (code === 401 || code === 403 || PP_isSignInPage_(text)) {
    return 'The web app asks visitors to sign in, so partners\' phones could not use it: its "Who has access" ' +
      'is not "Anyone". In the Apps Script editor: Deploy > Manage deployments > pencil icon (Edit) > Who has ' +
      'access: Anyone > Deploy. The address stays the same: then press "Check and save" again.';
  }
  if (code !== 200) {
    return 'Could not reach ' + url + ' (the server answered ' + code + '). Try again in a minute.';
  }
  return 'This address answers, but not as the Partner Pulse web app' + (answer ? '' : ' (it sent back a web page)') +
    '. Check that you deployed the script of THIS Sheet (Extensions > Apps Script > Deploy) and copied its ' +
    'address. If new code was pasted into the script, also update the deployment: Deploy > Manage ' +
    'deployments > pencil icon (Edit) > Version: New version > Deploy.';
}

/** True when a page is Google's sign-in page (what a web app not open to "Anyone" sends visitors to). */
function PP_isSignInPage_(text) {
  return /<title>[^<]*(Sign in|Google Accounts)|ServiceLogin|accounts\.google\.com\/(v3\/)?signin/i.test(text);
}

/** The text read as a JSON object, or null when it is not one (for example a web page). */
function PP_jsonOrNull_(text) {
  try {
    const value = JSON.parse(text);
    return PP_isPlainObject_(value) ? value : null;
  } catch (err) {
    return null;
  }
}

/** What the panel shows about the live version (from the history if the live copy could not be read). */
function PP_liveSummary_(ss, live) {
  if (live) {
    return { version: live.version, config_version: live.config_version, published_at: live.published_at,
      published_by: live.published_by, note: live.note };
  }
  const liveVersion = parseInt(PP_props_()[PP_SRV.KEYS.LIVE_VERSION], 10) || 0;
  if (!liveVersion) return null;
  const entry = PP_historyEntries_(ss).filter(candidate => candidate.version === liveVersion)[0];
  return entry ? { version: entry.version, config_version: entry.config_version,
    published_at: entry.published_at, published_by: entry.published_by, note: entry.note } : null;
}

/**
 * The codes partners already answered in the live version (Model.gs:
 * PP_liveIds). panelLoad passes null until a round has been opened: then
 * every list is empty and nothing is locked.
 */
function PP_liveIdsOf_(live) {
  if (!live) return { screens: [], areas: [], chips: {}, support: [], options: {} };
  return PP_liveIds(live);
}

/**
 * True when the draft would publish something different from the live
 * version (contract section 7). PP_compileForCompare (Model.gs) compiles the
 * draft and drops the version stamp (number, date, author, note) from both,
 * so only real content changes count.
 */
function PP_draftDiffersFromLive_(model, live) {
  if (!live) return true;
  try {
    return PP_compileForCompare(model) !== PP_compileForCompare(live);
  } catch (err) {
    console.error('Could not compare the draft with the live version: ' + err);
    return true;
  }
}

/** The one-time "open on this section" note left by a menu item (read once, then cleared). */
function PP_takeOpenSection_() {
  const props = PropertiesService.getUserProperties();
  const section = props.getProperty(PP_SRV.KEYS.PANEL_SECTION);
  if (section) props.deleteProperty(PP_SRV.KEYS.PANEL_SECTION);
  return section || null;
}

/** Today's date in India, for notes such as "English changed on 2026-10-21". */
function PP_todayInIndia_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
}
