/* =============================================================================
   ui.js: the shared drawing helpers of the form's screens (PP.ui).

   WHAT IT IS FOR
     Every kind of screen ("question type") draws itself with the same small
     building blocks, kept here once: the question title with its read-aloud
     button, a row of five faces, the "I don't handle this" link, the voice
     note / "type instead" box, and so on. The built-in screens
     (web/js/types.js) use them, and so can a NEW kind of question (one file in
     web/js/types/: docs/config-guide.md, "How to add a question type"), so it
     looks like the rest of the survey without copying code. Nothing here
     decides which screen comes next or what is sent: that is web/js/flow.js.

   WHAT IS IN PP.ui (each builds page elements with PP.h)
     say, langAttr, textEl, questionHead   texts and titles, marked with the
                     language they are really in (an untranslated text shows
                     in English, marked as English for screen readers)
     markSelected, facesRow, faces, naButton, ratingKey, supportKey
                     buttons and the five faces
     keyOf, nodeSetting, withTexts   a screen's own text keys and settings
     section, tellWidget             a screen's frame; the voice/typing box
     Each function's comment below says what it takes and returns.

   READS / WRITES: only what each call is given (the screen's ctx from
   web/js/app.js). Words come from the texts (PP.t), never from this file,
   and text is only ever set as text, never as HTML.

   LOADED BY web/index.html, after core.js, speech.js and voice.js (whose
   helpers it uses) and before types.js.

   TEST (Terminal, project folder): node tests/flow/types_test.js (draws every
   built-in screen and compares it with the drawing before 26 Oct 2026),
   and the real form: node tests/e2e/e2e.js.
   ES5 only (Chrome 61): no let, const, arrows, template strings, ?. or ??.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var h = PP.h;
  var t = PP.t;
  var ui = PP.ui = {};

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

  /* The voice note / "type instead" box for one answer key (web/js/voice.js). */
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

  ui.say = say;
  ui.langAttr = langAttr;
  ui.textEl = textEl;
  ui.questionHead = questionHead;
  ui.markSelected = markSelected;
  ui.ratingKey = ratingKey;
  ui.supportKey = supportKey;
  ui.keyOf = keyOf;
  ui.nodeSetting = nodeSetting;
  ui.withTexts = withTexts;
  ui.faces = faces;
  ui.facesRow = facesRow;
  ui.naButton = naButton;
  ui.section = section;
  ui.tellWidget = tellWidget;

}(typeof window !== 'undefined' ? window : globalThis));
