/* =============================================================================
   flow.js: the "brain" of the questionnaire. Nothing is drawn here.

   Using ONLY the questionnaire (the version published from the control
   panel, or the form's own copy in web/config/survey.json, see app.js), it
   answers three questions:

   1. buildSteps(config, ctx)
        Given the answers so far, which screens should this partner see, and in
        which order? It handles:
          - skip_if  (language screen when ?lang= is in the link; the
                      what-changed screen when the round has no items)
          - show_if  (e.g. the support block only when support_gate = yes)
          - one screen per area (function_ratings)
          - a "main problem" screen for every area rated at/below threshold
            (function_deep_dives), either after all ratings or right after
            each low rating (deep_dive.when)

   2. canProceed(step, state, config)
        Has the partner answered enough on this screen to press Next?

   3. buildSubmission(config, state, steps, meta, getAudio)
        Turns the answers into the message sent to the backend. The format is
        described in docs/submission-format.md. Only answers on the partner's
        FINAL path are included (if they rated Payments 2, answered its problem
        screen, then went Back and changed the rating to 5, that problem answer
        is dropped).

   HOW ANSWERS ARE STORED (in state.answers, keyed by screen id)
     answers["nps"]                    = 7
     answers["fn_rating:payments"]     = 2        or "na" for "Not my area"
     answers["fn_deep_dive:payments"]  = "payout_delayed"   (the chip code)
     answers["support_gate"]           = "yes"
     answers["support:kept_updated"]   = 4
   Typed text is in state.texts[itemId]; voice-note details in state.audio[itemId]
   (the recording itself is stored separately, see voice.js).
   Item ids: "fn_deep_dive:<area>", "support_comment", "one_fix", or the id of
   any extra free_text screen you add.

   This file has no browser-only code, so it can also be tested with Node.js.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var flow = PP.flow = {};

  /* The threshold for one area: its own "threshold" if set, else deep_dive.threshold. */
  flow.thresholdFor = function (config, fn) {
    if (fn && typeof fn.threshold === 'number') return fn.threshold;
    var t = config.deep_dive && Number(config.deep_dive.threshold);
    return t || 3;
  };

  /* Is this rating at or below the area's threshold? ("na" is never low.) */
  flow.isLow = function (config, fn, value) {
    return typeof value === 'number' && value <= flow.thresholdFor(config, fn);
  };

  /* ---------------------------------------------------------------------------
     show_if rules, e.g.
       { "answer": "support_gate", "equals": "yes" }
       { "answer": "nps", "at_most": 6 }
       { "answer": "fn_rating:payments", "in": [1, 2] }
       { "answer": "one_fix", "answered": true }
       { "all": [ rule, rule ] }   /   { "any": [ rule, rule ] }
     ------------------------------------------------------------------------- */
  flow.evalCondition = function (cond, answers) {
    if (!cond || typeof cond !== 'object') return true;
    if (Array.isArray(cond.all)) return cond.all.every(function (c) { return flow.evalCondition(c, answers); });
    if (Array.isArray(cond.any)) return cond.any.some(function (c) { return flow.evalCondition(c, answers); });

    var value = answers ? answers[cond.answer] : undefined;
    var has = value !== undefined && value !== null && value !== '';

    if ('equals' in cond) return has && String(value) === String(cond.equals);
    if ('not_equals' in cond) return !has || String(value) !== String(cond.not_equals);
    if ('at_most' in cond) return typeof value === 'number' && value <= Number(cond.at_most);
    if ('at_least' in cond) return typeof value === 'number' && value >= Number(cond.at_least);
    if ('in' in cond) {
      return has && Array.isArray(cond['in']) && cond['in'].map(String).indexOf(String(value)) !== -1;
    }
    if ('answered' in cond) return has === Boolean(cond.answered);
    return true; // unknown rule: show the screen (scripts/check_config.py reports the mistake)
  };

  /* ---------------------------------------------------------------------------
     Which screens, in which order?
     ctx = { answers, langInUrl: bool, hasWhatsChanged: bool }
     (pass flow.ruleAnswers(state) as answers so free-text screens can be tested)
     Each step = { id, type, entry (its line in "flow"), fn (area, if any) }
     ------------------------------------------------------------------------- */
  flow.buildSteps = function (config, ctx) {
    var answers = ctx.answers || {};
    var steps = [];
    var functions = config.functions || [];
    var immediate = config.deep_dive && config.deep_dive.when === 'immediate';

    function addDeepDive(entry, fn) {
      if (flow.isLow(config, fn, answers['fn_rating:' + fn.id])) {
        steps.push({ id: 'fn_deep_dive:' + fn.id, type: 'function_deep_dive', entry: entry, fn: fn });
      }
    }

    (config.flow || []).forEach(function (entry) {
      if (entry.skip_if === 'lang_in_url' && ctx.langInUrl) return;
      if (entry.skip_if === 'empty' && !ctx.hasWhatsChanged) return;
      if (entry.show_if && !flow.evalCondition(entry.show_if, answers)) return;

      if (entry.type === 'function_ratings') {
        functions.forEach(function (fn) {
          steps.push({ id: 'fn_rating:' + fn.id, type: 'function_rating', entry: entry, fn: fn });
          if (immediate) addDeepDive(entry, fn);
        });
      } else if (entry.type === 'function_deep_dives') {
        if (!immediate) functions.forEach(function (fn) { addDeepDive(entry, fn); });
      } else {
        steps.push({ id: entry.id, type: entry.type, entry: entry });
      }
    });

    // Safety net: the last screen must always be a thank-you screen.
    if (!steps.length || steps[steps.length - 1].type !== 'thank_you') {
      steps.push({ id: 'thanks', type: 'thank_you', entry: {} });
    }
    return steps;
  };

  /* What show_if rules look at: the normal answers, plus every free-text item
     (typed text or a voice note) counted as answered (true). This is what
     makes {"answer": "one_fix", "answered": true} work. */
  flow.ruleAnswers = function (state) {
    var out = {};
    var a = state.answers || {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(state.texts || {}).concat(Object.keys(state.audio || {})).forEach(function (id) {
      if (out[id] === undefined && flow.hasDetail(state, id)) out[id] = true;
    });
    return out;
  };

  flow.indexOf = function (steps, id) {
    for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return i;
    return -1;
  };

  /* Does this item have typed text or a voice note? */
  flow.hasDetail = function (state, itemId) {
    var text = state.texts ? state.texts[itemId] : '';
    return Boolean((text && String(text).trim()) || (state.audio && state.audio[itemId]));
  };

  /* Has the partner given an answer on this screen (used to show Next after Back)? */
  flow.isAnswered = function (step, state) {
    if (step.type === 'language_picker') return Boolean(state.lang_chosen);
    return state.answers[step.id] !== undefined;
  };

  /* Can the partner move on from this screen? */
  flow.canProceed = function (step, state, config) {
    var a = state.answers;
    var entry = step.entry || {};
    switch (step.type) {
      case 'language_picker':
        return Boolean(state.lang_chosen);
      case 'nps_0_10':
      case 'yes_no':
      case 'rating_1_5':
      case 'single_choice':
        return entry.required === false || a[step.id] !== undefined;
      case 'function_rating':
        return a[step.id] !== undefined;
      case 'function_deep_dive': {
        var dd = config.deep_dive || {};
        var chip = a[step.id];
        if (dd.require_chip !== false && !chip) return false;
        if (chip === 'other' && dd.require_detail_if_other !== false && !flow.hasDetail(state, step.id)) return false;
        return true;
      }
      case 'support_block': {
        if (entry.required === false) return true;
        var items = (config.support && config.support.items) || [];
        return items.every(function (item) { return a['support:' + item] !== undefined; });
      }
      case 'free_text':
        return entry.required !== true || flow.hasDetail(state, step.id);
      default:
        return true; // whats_changed, info_card, thank_you
    }
  };

  /* ---------------------------------------------------------------------------
     Build the "submit" message (see docs/submission-format.md).
       meta     = fields decided by app.js (ids, link, times, client info)
       getAudio = function(itemId) -> the recording as base64 text, or null
     ------------------------------------------------------------------------- */
  flow.buildSubmission = function (config, state, steps, meta, getAudio) {
    var a = state.answers || {};
    var answers = {};
    var ratings = [];
    var freeText = [];
    var onPath = {};
    steps.forEach(function (s) { onPath[s.id] = true; });

    function addText(itemId, block, fnId, issueCode, questionKey) {
      var text = String((state.texts && state.texts[itemId]) || '').trim();
      var clip = state.audio ? state.audio[itemId] : null;
      var audio = null;
      if (clip) {
        var b64 = getAudio ? getAudio(itemId) : null;
        if (b64) audio = { mime: clip.mime, duration_s: clip.duration_s, bytes: clip.bytes, base64: b64 };
      }
      if (!text && !audio) return;
      freeText.push({
        item_id: itemId,
        block: block,
        'function': fnId || null,
        issue_code: issueCode || null,
        question_key: questionKey || null,
        text: text,
        audio: audio
      });
    }

    steps.forEach(function (step) {
      var entry = step.entry || {};
      var v = a[step.id];
      switch (step.type) {
        case 'nps_0_10':
        case 'yes_no':
        case 'single_choice':
          if (v !== undefined) answers[step.id] = v;
          break;
        case 'rating_1_5':
          if (v !== undefined) {
            answers[step.id] = v;
            ratings.push({ block: 'question', item: step.id, rating: v, not_applicable: false,
              threshold: null, below_threshold: null, issue_code: null });
          }
          break;
        case 'function_rating': {
          if (v === undefined) break;
          var na = v === 'na';
          var threshold = flow.thresholdFor(config, step.fn);
          var ddId = 'fn_deep_dive:' + step.fn.id;
          ratings.push({
            block: 'function',
            item: step.fn.id,
            rating: na ? null : v,
            not_applicable: na,
            threshold: threshold,
            below_threshold: !na && typeof v === 'number' && v <= threshold,
            issue_code: onPath[ddId] && a[ddId] ? a[ddId] : null
          });
          break;
        }
        case 'function_deep_dive':
          addText(step.id, 'function', step.fn.id, a[step.id], 'q.tell_more');
          break;
        case 'support_block': {
          var support = config.support || {};
          (support.items || []).forEach(function (item) {
            var r = a['support:' + item];
            if (r === undefined) return;
            ratings.push({ block: 'support', item: item, rating: r === 'na' ? null : r, not_applicable: r === 'na',
              threshold: null, below_threshold: null, issue_code: null });
          });
          if (support.allow_comment !== false) {
            addText('support_comment', 'support', null, null, support.comment_text || 'q.support_comment');
          }
          break;
        }
        case 'free_text':
          addText(step.id, step.id === 'one_fix' ? 'one_fix' : 'question', null, null, entry.text || null);
          break;
        default:
          break;
      }
    });

    return {
      kind: 'submit',
      schema_version: 1,
      survey_id: meta.survey_id,
      config_version: meta.config_version,
      app_version: meta.app_version,
      submission_id: state.submission_id,
      session_id: state.session_id,
      dc: meta.dc,
      t: meta.t,
      round: meta.round,
      lang: meta.lang,
      mode: meta.mode,
      opened_at: state.opened_at || null,
      started_at: state.started_at || null,
      submitted_at: state.submitted_at || null,
      sent_at: meta.sent_at,
      attempt: meta.attempt,
      resume_count: state.resume_count || 0,
      client: meta.client,
      answers: answers,
      ratings: ratings,
      free_text: freeText,
      events: (state.events || []).slice()
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = flow;

}(typeof window !== 'undefined' ? window : globalThis));
