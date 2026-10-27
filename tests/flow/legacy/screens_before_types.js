/* =============================================================================
   screens.js: draws each kind of screen listed in "flow" (the questionnaire:
   published from the control panel, or web/config/survey.json).

   One drawing function per screen type:
     language_picker, whats_changed, nps_0_10, function_rating (one per area),
     function_deep_dive (main problem + tell us more), yes_no, support_block,
     free_text, rating_1_5, single_choice, info_card, thank_you

   Each function receives "ctx" from app.js and returns:
     {
       el:        the screen's elements,
       auto:      true if one tap answers it (the app then moves on automatically),
       optional:  (free text) true if the partner may leave it empty (Skip),
       nextLabel: optional string key for the Next button (default "ui.next"),
       blockedHint(): what to say when Next is pressed before answering,
       update(s): used by the thank-you screen to show the sending status
     }

   ctx gives: step, config, state, wc (what-changed content), mode,
     preview (true for the control panel's preview links),
     setAnswer(id, value, advance), refreshNav(), save(), saveSoon(), activity(),
     onCleanup(fn), chooseLanguage(code), ns, submit (status), retryNow(),
     startOver()

   TEXT KEYS (docs/flow-engine.md 4.6): step.keys (from flow.js, templates
   filled in) names the texts (text, label, help, options, rows, comment,
   ...) and step.node holds the screen's settings. Where the questionnaire
   sets nothing, the screen uses the key it always used (q.fn_rating,
   fn.<area>.name, thanks.title ...) and survey.json's rating / deep_dive /
   support settings, so today's questionnaire looks exactly as before. The
   support rows and comment box follow step.keys exactly (flow.js requires
   and sends only those).

   All words come from the texts (control panel "Texts", or the form's own
   copy web/i18n/strings.json); nothing here needs editing to
   change questions, areas, chips or languages. A text still waiting for its
   translation is shown in English and marked as English (lang="en-IN"), so
   screen readers pronounce it correctly.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var h = PP.h;
  var t = PP.t;
  var S = PP.screens = {};

  /* ---- Shared pieces ------------------------------------------------------ */

  /* A string key, or an already looked-up { text, lang } -> { text, lang }. */
  function say(source) {
    return typeof source === 'string' ? PP.i18n.info(source) : source;
  }

  /* lang attribute for text that is not in the page's language (English fallback). */
  function langAttr(info) {
    return info.lang && info.lang !== PP.i18n.lang ? PP.i18n.bcp47(info.lang) : null;
  }

  /* An element showing one text, marked with its real language. */
  function textEl(tag, cls, source) {
    var info = say(source);
    return h(tag, { 'class': cls || null, lang: langAttr(info), text: info.text });
  }

  /* Question title with the read-aloud button.
     source: a string key or { text, lang }. speakItems: see speech.js.
     context: optional words screen readers say first (e.g. the area name). */
  function questionHead(source, speakItems, context) {
    var info = say(source);
    var title = h('h1', {
      'class': 'q-title',
      tabindex: '-1',
      lang: langAttr(info),
      'aria-label': context ? context + '. ' + info.text : null,
      text: info.text
    });
    var row = h('div', { 'class': 'q-head' }, [title]);
    if (speakItems && speakItems.length) row.appendChild(PP.speech.button(function () { return speakItems; }));
    return row;
  }

  /* Mark one button in a group as selected (chosen = null: none). */
  function markSelected(buttons, chosen) {
    buttons.forEach(function (b) {
      var on = b === chosen;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* String keys built from codes (kept out of t('...') so the config checker's
     scan of literal keys does not mistake a prefix for a missing key). */
  function ratingKey(n) { return 'rating.' + n; }
  function supportKey(item) { return 'support.' + item; }

  /* A text key of the screen: step.keys[field] if set, else fallback. */
  function keyOf(step, field, fallback) {
    var k = step.keys;
    return k && k[field] !== undefined ? k[field] : fallback;
  }

  /* A yes/no setting: the node's own field if set, else fallback (survey.json). */
  function nodeSetting(step, field, fallback) {
    var node = step.node;
    return node && node[field] !== undefined ? node[field] === true : fallback;
  }

  /* Options as [{code, text}], from step.keys.options or a list of codes;
     an option without a text key gets defaultKey(code). */
  function withTexts(list, defaultKey) {
    return (list || []).map(function (option) {
      var code = option !== null && typeof option === 'object' ? option.code : option;
      var text = option !== null && typeof option === 'object' ? option.text : undefined;
      return { code: code, text: typeof text === 'string' ? text : defaultKey(code) };
    });
  }

  function faces(config) {
    var f = (config.rating && config.rating.faces) || [];
    return f.length === 5 ? f : ['1', '2', '3', '4', '5'];
  }

  /* A row of five faces (1-5). compact = small, without labels (support rows). */
  function facesRow(config, value, onPick, compact, groupLabel) {
    var emoji = faces(config);
    var row = h('div', { 'class': 'faces' + (compact ? ' compact' : ''), role: 'group', 'aria-label': groupLabel || null });
    var buttons = [];
    for (var n = 1; n <= 5; n++) {
      (function (score) {
        var label = say(ratingKey(score));
        var kids = [h('span', { 'class': 'face-emoji', 'aria-hidden': 'true', text: emoji[score - 1] })];
        if (!compact) kids.push(textEl('span', 'face-label', label));
        var b = h('button', {
          type: 'button',
          'class': 'choice face' + (value === score ? ' is-selected' : ''),
          'aria-pressed': value === score ? 'true' : 'false',
          'aria-label': score + ' - ' + label.text,
          title: label.text
        }, kids);
        b.addEventListener('click', function () {
          markSelected(buttons, b);
          onPick(score, b);
        });
        buttons.push(b);
        row.appendChild(b);
      }(n));
    }
    row._ppButtons = buttons;
    return row;
  }

  /* The small "I don't handle this" / "Doesn't apply" link under a face row. */
  function naButton(labelKey, selected, onPick) {
    var info = say(labelKey);
    var b = h('button', {
      type: 'button',
      'class': 'link-btn na-btn' + (selected ? ' is-selected' : ''),
      'aria-pressed': selected ? 'true' : 'false',
      lang: langAttr(info)
    }, info.text);
    b.addEventListener('click', function () { onPick(b); });
    return b;
  }

  function section(children, extraClass) {
    return h('section', { 'class': 'q' + (extraClass ? ' ' + extraClass : '') }, children);
  }

  function tellWidget(ctx, itemId) {
    return PP.voice.widget({
      itemId: itemId,
      ns: ctx.ns,
      config: ctx.config,
      state: ctx.state,
      save: ctx.save,
      saveSoon: ctx.saveSoon,
      onChange: ctx.refreshNav,
      onActivity: ctx.activity,
      onCleanup: ctx.onCleanup
    });
  }

  /* ---- S0: language picker ------------------------------------------------- */
  S.language_picker = function (ctx) {
    var chosen = ctx.state.lang_chosen ? ctx.state.lang : null;
    var buttons = [];
    var grid = h('div', { 'class': 'lang-grid' });
    (ctx.config.languages || []).forEach(function (L) {
      var b = h('button', {
        type: 'button',
        'class': 'choice lang-choice' + (chosen === L.code ? ' is-selected' : ''),
        'aria-pressed': chosen === L.code ? 'true' : 'false',
        lang: L.bcp47
      }, L.native_name);
      b.addEventListener('click', function () {
        markSelected(buttons, b);
        ctx.chooseLanguage(L.code);
      });
      buttons.push(b);
      grid.appendChild(b);
    });
    return {
      el: section([questionHead('lang.title', null), grid]),
      auto: true
    };
  };

  /* ---- S1: what changed since last time ------------------------------------ */
  S.whats_changed = function (ctx) {
    var wc = ctx.wc || { items: [] };
    var title = wc.title ? PP.i18n.pick(wc.title) : PP.i18n.info('wc.title');
    var items = (wc.items || []).map(function (it) { return PP.i18n.pick(it); });
    var speak = [{ text: title.text, lang: title.lang }].concat(items.map(function (i) {
      return { text: i.text, lang: i.lang };
    }));
    var list = h('ul', { 'class': 'wc-list' }, items.map(function (i) { return textEl('li', null, i); }));
    return {
      el: section([questionHead(title, speak), list]),
      auto: false,
      nextLabel: 'ui.continue'
    };
  };

  /* ---- S2: NPS 0-10 ------------------------------------------------------- */
  S.nps_0_10 = function (ctx) {
    var e = ctx.step.entry || {};
    var textKey = keyOf(ctx.step, 'text', e.text);
    var lowKey = keyOf(ctx.step, 'low_label', e.low_label);
    var highKey = keyOf(ctx.step, 'high_label', e.high_label);
    var hintKey = keyOf(ctx.step, 'scale_hint', e.scale_hint);
    var value = ctx.state.answers[ctx.step.id];
    var buttons = [];
    var rowA = h('div', { 'class': 'nps-row nps-row-a' });
    var rowB = h('div', { 'class': 'nps-row nps-row-b' });
    for (var n = 0; n <= 10; n++) {
      (function (score) {
        var b = h('button', {
          type: 'button',
          'class': 'choice nps-chip' + (value === score ? ' is-selected' : ''),
          'aria-pressed': value === score ? 'true' : 'false'
        }, String(score));
        b.addEventListener('click', function () {
          markSelected(buttons, b);
          ctx.setAnswer(ctx.step.id, score, true);
        });
        buttons.push(b);
        (score <= 5 ? rowA : rowB).appendChild(b);
      }(n));
    }
    var ends = h('div', { 'class': 'nps-ends', 'aria-hidden': 'true' }, [
      h('span', { text: lowKey ? '0 = ' + t(lowKey) : '' }),
      h('span', { text: highKey ? t(highKey) + ' = 10' : '' })
    ]);
    var speak = [{ key: textKey }];
    if (hintKey) speak.push({ key: hintKey });
    var group = h('div', { role: 'group', 'aria-label': t(textKey) }, [rowA, rowB]);
    return {
      el: section([questionHead(textKey, speak), group, ends]),
      auto: true,
      blockedHint: function () { return t('ui.choose_one'); }
    };
  };

  /* ---- S3: one area, 1-5 faces ---------------------------------------------- */
  S.function_rating = function (ctx) {
    var fn = ctx.step.fn || {};
    var nameKey = keyOf(ctx.step, 'label', 'fn.' + fn.id + '.name');
    var helpKey = keyOf(ctx.step, 'help', 'fn.' + fn.id + '.help');
    var questionKey = keyOf(ctx.step, 'text', 'q.fn_rating');
    var value = ctx.state.answers[ctx.step.id];
    var speak = [{ key: nameKey }, { key: helpKey }, { key: questionKey }];

    var naBtn = null;
    var row = facesRow(ctx.config, value, function (score) {
      if (naBtn) markSelected([naBtn], null);
      ctx.setAnswer(ctx.step.id, score, true);
    }, false, t(nameKey));

    var kids = [
      textEl('p', 'area-name', nameKey),
      textEl('p', 'area-help', helpKey),
      questionHead(questionKey, speak, t(nameKey)),
      row
    ];
    if (nodeSetting(ctx.step, 'allow_not_applicable', Boolean(ctx.config.rating && ctx.config.rating.allow_not_applicable))) {
      naBtn = naButton('rating.na', value === 'na', function (b) {
        markSelected(row._ppButtons, null);
        markSelected([b], b);
        ctx.setAnswer(ctx.step.id, 'na', true);
      });
      kids.push(naBtn);
    }
    return {
      el: section(kids),
      auto: true,
      blockedHint: function () { return t('ui.choose_one'); }
    };
  };

  /* ---- S4: main problem + tell us more (for low-rated areas) --------------- */
  S.function_deep_dive = function (ctx) {
    var step = ctx.step;
    var fn = step.fn || {};
    var node = step.node;
    var dd = ctx.config.deep_dive || {};
    var nameKey = keyOf(step, 'label', 'fn.' + fn.id + '.name');
    var questionKey = keyOf(step, 'text', 'q.deep_dive');
    var tellOptionalKey = keyOf(step, 'detail_text', 'q.tell_more');
    var tellRequiredKey = keyOf(step, 'detail_text_required', 'q.tell_more_required');
    // The rating shown at the top: the node's rating_from, else fn_rating:<area>
    var ratingId = node && typeof node.rating_from === 'string' ? PP.flow.fill(node.rating_from, step.vars) : 'fn_rating:' + fn.id;
    var rating = ctx.state.answers[ratingId];
    var chosen = ctx.state.answers[step.id];
    var chipKey = function (code) { return code === 'other' ? 'issue.other' : 'issue.' + fn.id + '.' + code; };
    var options = withTexts(keyOf(step, 'options', null) || (fn.issues || []).concat(['other']), chipKey);
    // "Other" needs a voice note or text? The rule flow.js applies to Next.
    var detailIfOther = node ? node.require_detail_if_other !== false : dd.require_detail_if_other !== false;

    var hint = textEl('p', 'hint is-error', 'dd.other_needs_detail');
    hint.hidden = true;
    var tellTitle = h('h2', { 'class': 'sub-title' });
    // With "Other" picked, a voice note or text becomes required: the heading
    // drops "(optional)" and the red hint shows until something is added.
    var tellRequired = function () {
      return ctx.state.answers[step.id] === 'other' && detailIfOther;
    };
    var tellKey = function () { return tellRequired() ? tellRequiredKey : tellOptionalKey; };
    // The heading has its own speaker, which reads whichever text is showing.
    var tellSpeak = PP.speech.button(function () { return [{ key: tellKey() }]; });
    var tellHead = h('div', { 'class': 'q-head sub-head' }, [tellTitle, tellSpeak]);
    var updateHint = function () {
      hint.hidden = !(tellRequired() && !PP.flow.hasDetail(ctx.state, step.id));
      var info = say(tellKey());
      tellTitle.textContent = info.text;
      if (langAttr(info)) tellTitle.setAttribute('lang', langAttr(info));
      else tellTitle.removeAttribute('lang');
      tellSpeak._ppUpdate();
    };

    var buttons = [];
    var chips = h('div', { 'class': 'chips', role: 'group', 'aria-label': t(questionKey) });
    options.forEach(function (option) {
      var code = option.code;
      var b = h('button', {
        type: 'button',
        'class': 'choice chip' + (chosen === code ? ' is-selected' : ''),
        'aria-pressed': chosen === code ? 'true' : 'false'
      }, [PP.icon('check'), textEl('span', null, option.text)]);
      b.addEventListener('click', function () {
        markSelected(buttons, b);
        ctx.setAnswer(step.id, code, false);
        updateHint();
      });
      buttons.push(b);
      chips.appendChild(b);
    });

    var speak = [{ key: nameKey }, { key: questionKey }].concat(options.map(function (option) {
      return { key: option.text };
    }));

    var emoji = faces(ctx.config);
    var ratingText = typeof rating === 'number' ? emoji[rating - 1] + ' ' + t(ratingKey(rating)) : '';

    // The widget calls refreshNav on every change; also refresh our hint then.
    var widgetCtx = Object.assign({}, ctx, {
      refreshNav: function () { updateHint(); ctx.refreshNav(); }
    });
    var widget = tellWidget(widgetCtx, step.id);
    updateHint();

    return {
      el: section([
        textEl('p', 'area-name', nameKey),
        h('p', { 'class': 'your-rating', text: t('dd.your_rating') + ': ' + ratingText }),
        questionHead(questionKey, speak, t(nameKey)),
        chips,
        tellHead,
        hint,
        widget
      ]),
      auto: false,
      blockedHint: function () {
        if (!ctx.state.answers[step.id]) return t('ui.choose_one');
        return t('dd.other_needs_detail');
      }
    };
  };

  /* ---- Yes / No (support gate, or any extra yes/no question) -------------- */
  S.yes_no = function (ctx) {
    var e = ctx.step.entry || {};
    var textKey = keyOf(ctx.step, 'text', e.text);
    var value = ctx.state.answers[ctx.step.id];
    var buttons = [];
    var box = h('div', { 'class': 'yesno', role: 'group', 'aria-label': t(textKey) });
    [['yes', 'ui.yes'], ['no', 'ui.no']].forEach(function (pair) {
      var label = say(pair[1]);
      var b = h('button', {
        type: 'button',
        'class': 'choice' + (value === pair[0] ? ' is-selected' : ''),
        'aria-pressed': value === pair[0] ? 'true' : 'false',
        lang: langAttr(label)
      }, label.text);
      b.addEventListener('click', function () {
        markSelected(buttons, b);
        ctx.setAnswer(ctx.step.id, pair[0], true);
      });
      buttons.push(b);
      box.appendChild(b);
    });
    return {
      el: section([questionHead(textKey, [{ key: textKey }]), box]),
      auto: true,
      blockedHint: function () { return t('ui.choose_one'); }
    };
  };

  /* ---- S5: support block (all items on one screen) -------------------------
     Rows and comment box: step.keys (a step made without a node: survey.json). */
  S.support_block = function (ctx) {
    var step = ctx.step;
    var e = step.entry || {};
    var textKey = keyOf(step, 'text', e.text);
    var support = ctx.config.support || {};
    var keys = step.keys || {};
    var oldComment = support.allow_comment !== false ?
      { key: 'support_comment', text: support.comment_text || 'q.support_comment' } : null;
    var items = step.node ? (keys.rows || []) : (support.items || []).map(function (item) {
      return { id: item, key: 'support:' + item, text: supportKey(item) };
    });
    var comment = step.node ? keys.comment || null : oldComment;
    var allowNa = nodeSetting(step, 'allow_not_applicable', support.allow_not_applicable === true);
    var emoji = faces(ctx.config);
    var rows = [];
    var rowText = function (item) { return typeof item.text === 'string' ? item.text : supportKey(item.id); };
    var kids = [
      questionHead(textKey, [{ key: textKey }].concat(items.map(function (i) { return { key: rowText(i) }; }))),
      h('p', { 'class': 'legend', text: emoji[0] + ' ' + t('rating.1') + '   …   ' + emoji[4] + ' ' + t('rating.5') })
    ];
    items.forEach(function (item) {
      var id = item.key;
      var value = ctx.state.answers[id];
      var label = t(rowText(item));
      var rowEl = h('div', { 'class': 'srow' }, [textEl('p', 'srow-label', rowText(item))]);
      var naBtn = null;
      var facesEl = facesRow(ctx.config, value, function (score) {
        rowEl.classList.remove('is-missing');
        if (naBtn) markSelected([naBtn], null);
        ctx.setAnswer(id, score, false);
      }, true, label);
      rowEl.appendChild(facesEl);
      if (allowNa) {
        naBtn = naButton('support.not_applicable', value === 'na', function (b) {
          rowEl.classList.remove('is-missing');
          markSelected(facesEl._ppButtons, null);
          markSelected([b], b);
          ctx.setAnswer(id, 'na', false);
        });
        rowEl.appendChild(naBtn);
      }
      rows.push({ id: id, el: rowEl });
      kids.push(rowEl);
    });
    if (comment && comment.key !== undefined) {
      var commentKey = typeof comment.text === 'string' ? comment.text : 'q.support_comment';
      kids.push(h('div', { 'class': 'q-head sub-head' }, [
        textEl('h2', 'sub-title', commentKey),
        PP.speech.button(function () { return [{ key: commentKey }]; })
      ]));
      kids.push(tellWidget(ctx, comment.key));
    }
    return {
      el: section(kids),
      auto: false,
      blockedHint: function () {
        var first = null;
        rows.forEach(function (r) {
          var missing = ctx.state.answers[r.id] === undefined;
          r.el.classList.toggle('is-missing', missing);
          if (missing && !first) first = r.el;
        });
        if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' });
        return t('ui.answer_all');
      }
    };
  };

  /* ---- S6 and any extra open question: voice note or text ------------------ */
  S.free_text = function (ctx) {
    var e = ctx.step.entry || {};
    var textKey = keyOf(ctx.step, 'text', e.text);
    return {
      el: section([questionHead(textKey, [{ key: textKey }]), tellWidget(ctx, ctx.step.id)]),
      auto: false,
      optional: e.required !== true,
      blockedHint: function () { return t('text.required'); }
    };
  };

  /* ---- Extra question types you can add in "flow" without code --------------- */
  S.rating_1_5 = function (ctx) {
    var e = ctx.step.entry || {};
    var textKey = keyOf(ctx.step, 'text', e.text);
    var row = facesRow(ctx.config, ctx.state.answers[ctx.step.id], function (score) {
      ctx.setAnswer(ctx.step.id, score, true);
    }, false, t(textKey));
    return {
      el: section([questionHead(textKey, [{ key: textKey }]), row]),
      auto: true,
      blockedHint: function () { return t('ui.choose_one'); }
    };
  };

  S.single_choice = function (ctx) {
    var e = ctx.step.entry || {};
    var textKey = keyOf(ctx.step, 'text', e.text);
    var ownId = (ctx.step.node && ctx.step.node.id) || ctx.step.id;
    var options = withTexts(keyOf(ctx.step, 'options', null) || e.options, function (code) {
      return 'choice.' + ownId + '.' + code;
    });
    var value = ctx.state.answers[ctx.step.id];
    var buttons = [];
    var list = h('div', { 'class': 'chips one-col', role: 'group', 'aria-label': t(textKey) });
    options.forEach(function (option) {
      var code = option.code;
      var b = h('button', {
        type: 'button',
        'class': 'choice chip' + (value === code ? ' is-selected' : ''),
        'aria-pressed': value === code ? 'true' : 'false'
      }, [PP.icon('check'), textEl('span', null, option.text)]);
      b.addEventListener('click', function () {
        markSelected(buttons, b);
        ctx.setAnswer(ctx.step.id, code, true);
      });
      buttons.push(b);
      list.appendChild(b);
    });
    var speak = [{ key: textKey }].concat(options.map(function (option) {
      return { key: option.text };
    }));
    return {
      el: section([questionHead(textKey, speak), list]),
      auto: true,
      blockedHint: function () { return t('ui.choose_one'); }
    };
  };

  S.info_card = function (ctx) {
    var e = ctx.step.entry || {};
    var textKey = keyOf(ctx.step, 'text', e.text);
    var bodyKey = keyOf(ctx.step, 'body', e.body);
    var speak = bodyKey ? [{ key: textKey }, { key: bodyKey }] : [{ key: textKey }];
    var kids = [questionHead(textKey, speak)];
    if (bodyKey) kids.push(textEl('p', 'body-text', bodyKey));
    return { el: section(kids), auto: false, nextLabel: 'ui.continue' };
  };

  /* ---- S7: thank you + sending status -------------------------------------
     ctx.submit.status is one of:
       sending | done | failed | error | bad_link | already | incomplete
       closed   : the survey round has closed (new visitors only)
       not_open : the survey round has not started yet (a "draft" round)
       preview  : the end of a preview: nothing was sent or saved
     The app calls update() whenever the status (or the countdown) changes.
     The box is a "status" region, so screen readers announce each change. */
  S.thank_you = function (ctx) {
    var box = h('section', { 'class': 'q final', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
    var shownStatus = null;
    var countdown = null;
    // Each ending may have its own title and text (several endings)
    var endTitleKey = keyOf(ctx.step, 'text', 'thanks.title');
    var endBodyKey = keyOf(ctx.step, 'body', 'thanks.body');

    /* tone: null = green (all good), 'warn' = red (a problem), 'info' = brand
       colour (nothing wrong, just information, e.g. "not open yet"). */
    function message(iconName, tone, titleKey, lines, speakKeys) {
      var kids = [];
      if (iconName) kids.push(PP.icon(iconName, 'big-icon' + (tone ? ' is-' + tone : '')));
      var speak = (speakKeys || []).map(function (k) { return { key: k }; });
      kids.push(questionHead(titleKey, speak.length ? speak : null));
      (lines || []).forEach(function (line) { kids.push(line); });
      return kids;
    }

    function retryButton() {
      return h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: ctx.retryNow } }, t('submit.retry_now'));
    }

    /* Test mode and preview only: forget this phone's answers and start again. */
    function startOverButton() {
      if (ctx.mode !== 'mock' && !ctx.preview) return null;
      return h('button', { type: 'button', 'class': 'btn', on: { click: ctx.startOver } },
        t(ctx.preview ? 'ui.start_again' : 'dev.start_over'));
    }

    function render(sub) {
      PP.clear(box);
      countdown = null;
      var kids;
      switch (sub.status) {
        case 'sending':
          kids = [h('div', { 'class': 'spinner', 'aria-hidden': 'true' }), textEl('p', null, 'submit.sending')];
          break;
        case 'done':
          kids = message('checkCircle', null, endTitleKey, [
            textEl('p', null, endBodyKey),
            textEl('p', 'muted', 'thanks.close')
          ], [endTitleKey, endBodyKey]);
          break;
        case 'failed':
          countdown = h('p', { 'class': 'muted' });
          kids = message(null, null, endTitleKey, [textEl('p', null, 'submit.failed'), countdown, retryButton()],
            [endTitleKey, 'submit.failed']);
          break;
        case 'error':
          kids = message('warn', 'warn', endTitleKey, [textEl('p', null, 'submit.error'), retryButton()], ['submit.error']);
          break;
        case 'already':
          kids = message('checkCircle', null, 'already.title', [textEl('p', null, 'already.body')],
            ['already.title', 'already.body']);
          break;
        case 'bad_link':
          kids = message('warn', 'warn', 'link.bad_title', [textEl('p', null, 'submit.bad_link')],
            ['link.bad_title', 'submit.bad_link']);
          break;
        case 'incomplete':
          kids = message('warn', 'warn', 'link.bad_title', [textEl('p', null, 'link.incomplete')],
            ['link.bad_title', 'link.incomplete']);
          break;
        case 'closed':
          kids = message('eventBusy', 'info', 'round.closed_title', [textEl('p', null, 'round.closed_body')],
            ['round.closed_title', 'round.closed_body']);
          break;
        case 'not_open':
          kids = message('schedule', 'info', 'round.not_open_title', [textEl('p', null, 'round.not_open_body')],
            ['round.not_open_title', 'round.not_open_body']);
          break;
        case 'preview':
          kids = message('checkCircle', null, endTitleKey, [textEl('p', null, 'dev.preview_done')],
            [endTitleKey, 'dev.preview_done']);
          break;
        default:
          kids = [];
      }
      kids.forEach(function (k) { box.appendChild(k); });
      if (sub.status !== 'sending') {
        var again = startOverButton();
        if (again) box.appendChild(h('p', null, again));
      }
      shownStatus = sub.status;
    }

    function update(sub) {
      if (sub.status !== shownStatus) render(sub);
      if (countdown) {
        countdown.textContent = sub.retryIn > 0 ? t('submit.retrying_in', { s: sub.retryIn }) : '';
      }
    }

    update(ctx.submit);
    return { el: box, auto: false, update: update };
  };

}(typeof window !== 'undefined' ? window : globalThis));
