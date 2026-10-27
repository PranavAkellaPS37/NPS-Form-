/* =============================================================================
   stars_1_10.js: a complete EXAMPLE of a new kind of question ("question
   type"): ten numbered stars, the partner taps one.

   WHAT IT IS FOR
     It is not part of the form (phones never load it). It is the worked
     example of docs/config-guide.md, "How to add a question type", and the
     tests use it to prove that a new kind needs nothing but this one file
     plus one <script> line in web/index.html:
       - tests/flow/types_test.js registers it, draws it, checks that the
         standard rules decide when Next is allowed and what is sent, and that
         the flow checker knows it from its description alone;
       - tests/flow/sim_test.js copies the form to a temporary folder, adds
         this file there with its <script> line, and checks that
         node scripts/flow.js types and python3 scripts/check_config.py
         notice it.
     To use it for real: copy it to web/js/types/stars_1_10.js, add
       <script defer src="js/types/stars_1_10.js"></script>
     to web/index.html after js/types.js, add its texts to strings.json, and
     run  node scripts/flow.js types --write  (the guide has every step).

   WHAT IT DESCRIBES (PP.types.register; every field: the guide)
     A screen with a question ("text"), an optional line under the stars
     ("low_label") and "required" (true unless set to false). Its answer is a
     whole number from 1 to 10; it sends that answer only ("records":
     {"answers": 1}). It sends no ratings row: a ratings row holds a rating
     from 1 to 5 (docs/submission-format.md), and node scripts/flow.js types
     refuses one for any other answer. It brings no isComplete or collect of
     its own, so the standard rules apply: Next needs a star unless
     "required" is false.
     On the phone the ten buttons sit in two rows of five (the same rows as
     the 0-10 question), so all of them fit a small screen without
     scrolling.

   READS / WRITES: nothing; render(ctx) draws with PP.ui (web/js/ui.js).
   ES5 only (Chrome 61): no let, const, arrows, template strings, ?. or ??.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP;

  PP.types.register({
    type: 'stars_1_10',
    label: 'Stars (1 to 10)',
    description: 'Ten numbered stars; the partner taps one.',
    fields: {
      text: { kind: 'text_key', required: true },
      low_label: { kind: 'text_key' },
      required: { kind: 'bool', 'default': true }
    },
    answer: { kind: 'number', min: 1, max: 10, what: 'the star rating' },
    records: { answers: 1 },
    flags: { auto: true },
    row: { label: 'Stars (1 to 10)', needs_text: true, fields: ['low_label', 'required'], required_default: true,
      repeatable: true, icon: '⭐', order: 65 },

    /* Draws the screen. Everything that touches the page stays in here: the
       command line and the control panel read this file without a page. */
    render: function (ctx) {
      var h = PP.h;
      var t = PP.t;
      var ui = PP.ui;
      var step = ctx.step;
      var textKey = ui.keyOf(step, 'text', step.node.text);
      var lowKey = ui.keyOf(step, 'low_label', step.node.low_label);
      var value = ctx.state.answers[step.id];
      var buttons = [];
      // two rows of five buttons (1-5, then 6-10; the 0-10 question's five-across row), so all ten fit a small phone
      var rows = [h('div', { 'class': 'nps-row nps-row-b' }), h('div', { 'class': 'nps-row nps-row-b' })];
      var group = h('div', { role: 'group', 'aria-label': t(textKey) }, rows);
      for (var n = 1; n <= 10; n++) {
        (function (score) {
          var b = h('button', {
            type: 'button',
            'class': 'choice nps-chip' + (value === score ? ' is-selected' : ''),
            'aria-pressed': value === score ? 'true' : 'false'
          }, String(score));
          b.addEventListener('click', function () {
            ui.markSelected(buttons, b);
            ctx.setAnswer(step.id, score, true);
          });
          buttons.push(b);
          rows[score <= 5 ? 0 : 1].appendChild(b);
        }(n));
      }
      var kids = [ui.questionHead(textKey, [{ key: textKey }]), group];
      if (lowKey) kids.push(ui.textEl('p', 'muted', lowKey));
      // "auto" is left out: the kind's flags.auto (true) is used
      return { el: ui.section(kids), blockedHint: function () { return t('ui.choose_one'); } };
    }
  });

}(typeof window !== 'undefined' ? window : globalThis));
