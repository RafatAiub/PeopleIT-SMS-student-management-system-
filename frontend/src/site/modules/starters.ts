/**
 * Starter module library (W17): installable from Website Builder → Modules
 * with one click (each is imported through `POST /sites/modules/import`, so it
 * arrives as an editable DRAFT; publish it to use it on pages).
 *
 * All are Bangla-ready (text fields with `bn: true`, `| t` phrases, `num` /
 * `money` / `date` filters that switch digits and month names) and use the
 * site's theme variables, so they match whatever template the school picked.
 * "Teacher spotlight" is exactly the example in docs/website-builder/GUIDE.md §7.2.
 */

export interface StarterModule {
  key: string;
  name: string;
  nameBn: string;
  description: string;
  category: string;
  icon: string;
  fields: unknown[];
  template: string;
  css: string;
  js: string;
}

const teacherSpotlight: StarterModule = {
  key: 'teacher-spotlight',
  name: 'Teacher spotlight',
  nameBn: 'শিক্ষক পরিচিতি',
  description: 'A grid of opted-in teachers with photo, name and subject, linking to their profile pages.',
  category: 'people',
  icon: 'users',
  fields: [
    { key: 'heading', type: 'text', label: 'Heading', bn: true, default: 'Our teachers' },
    { key: 'teachers', type: 'collection', collection: 'teachers', limit: 6, sort: 'name' },
    { key: 'show_subject', type: 'boolean', label: 'Show subject', default: true },
  ],
  template: `<section class="spotlight">
  <h2>{{ module.heading | t }}</h2>
  <div class="grid">
  {% for t in module.teachers %}
    <a class="card" href="{{ t.url }}">
      <img src="{{ t.photo | img: 400 }}" alt="{{ t.name }}">
      <h3>{{ t.name }}</h3>
      {% if module.show_subject and t.subject %}<p>{{ t.subject }}</p>{% endif %}
    </a>
  {% else %}
    <p>{{ 'No teachers yet' | t }}</p>
  {% endfor %}
  </div>
</section>
`,
  css: `.spotlight .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.spotlight .card { border-radius: var(--site-radius); padding: 12px; background: var(--site-surface); text-decoration: none; }
`,
  js: '',
};

const noticeTicker: StarterModule = {
  key: 'notice-ticker',
  name: 'Notice ticker',
  nameBn: 'নোটিশ টিকার',
  description: 'A scrolling strip of the latest public notices (pauses on hover; still for visitors who prefer reduced motion).',
  category: 'notices',
  icon: 'megaphone',
  fields: [
    { key: 'label', type: 'text', label: 'Label', bn: true, default: { en: 'Notice', bn: 'নোটিশ' } },
    { key: 'notices', type: 'collection', label: 'Notices', collection: 'notices', limit: 8, sort: '-publishedAt' },
    { key: 'speed', type: 'select', label: 'Speed', default: '30', options: [{ value: '45', label: 'Slow', labelBn: 'ধীর' }, { value: '30', label: 'Normal', labelBn: 'স্বাভাবিক' }, { value: '18', label: 'Fast', labelBn: 'দ্রুত' }] },
    { key: 'style', type: 'select', label: 'Colour', default: 'primary', options: [{ value: 'primary', label: 'Brand colour' }, { value: 'dark', label: 'Dark' }, { value: 'soft', label: 'Light' }] },
    { key: 'show_date', type: 'boolean', label: 'Show dates', default: true },
  ],
  template: `<div class="ticker ticker--{{ module.style }}" style="--ticker-speed: {{ module.speed | default: 30 }}s">
  <span class="ticker__label">{{ module.label | t }}</span>
  <div class="ticker__track">
    <div class="ticker__move">
      {% for n in module.notices %}
        <a class="ticker__item" href="{{ n.url }}">{{ n.title }}{% if module.show_date and n.publishedAt %} <small>· {{ n.publishedAt | date: 'day' }}</small>{% endif %}</a>
      {% else %}
        <span class="ticker__item">{{ 'No notices yet' | t }}</span>
      {% endfor %}
      {% for n in module.notices %}
        <a class="ticker__item" href="{{ n.url }}" aria-hidden="true" tabindex="-1">{{ n.title }}</a>
      {% endfor %}
    </div>
  </div>
</div>
`,
  css: `.ticker { display: flex; align-items: stretch; overflow: hidden; border-radius: var(--site-radius); border: 1px solid var(--site-border); background: var(--site-surface); color: var(--site-text); }
.ticker__label { flex: none; display: flex; align-items: center; padding: 10px 16px; font-weight: 700; background: var(--site-primary); color: var(--site-on-primary); }
.ticker--dark { background: #0f172a; color: #f8fafc; border-color: #0f172a; }
.ticker--dark .ticker__label { background: #1e293b; color: #f8fafc; }
.ticker--soft .ticker__label { background: transparent; color: var(--site-primary-text, var(--site-text)); border-right: 1px solid var(--site-border); }
.ticker__track { position: relative; flex: 1; overflow: hidden; display: flex; align-items: center; }
.ticker__move { display: inline-flex; gap: 40px; white-space: nowrap; padding: 10px 20px; animation: pnit-ticker var(--ticker-speed, 30s) linear infinite; }
.ticker:hover .ticker__move, .ticker:focus-within .ticker__move { animation-play-state: paused; }
.ticker__item { color: inherit; text-decoration: none; font-weight: 500; }
.ticker__item:hover { text-decoration: underline; }
.ticker__item small { opacity: .7; font-weight: 400; }
@keyframes pnit-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .ticker__move { animation: none; white-space: normal; flex-wrap: wrap; gap: 8px 24px; } }
`,
  js: '',
};

const eventStrip: StarterModule = {
  key: 'event-calendar-strip',
  name: 'Event calendar strip',
  nameBn: 'অনুষ্ঠান ক্যালেন্ডার',
  description: 'The next upcoming events as date cards in a horizontal strip (queries data with {% collection %}).',
  category: 'events',
  icon: 'calendar',
  fields: [
    { key: 'heading', type: 'text', label: 'Heading', bn: true, default: { en: 'Upcoming events', bn: 'আসন্ন অনুষ্ঠান' } },
    { key: 'count', type: 'number', label: 'How many events', default: 6, min: 1, max: 12 },
    { key: 'all_link', type: 'link', label: '“View all” link (optional)', default: '' },
  ],
  template: `{% assign today = 'now' | date: '%Y-%m-%d' %}
{% collection "events" limit:module.count sort:"startDate" filter.startDate.gte:today as events %}
<div class="evs">
  <div class="evs__head">
    {% if module.heading %}<h2>{{ module.heading }}</h2>{% endif %}
    {% if module.all_link %}<a href="{{ module.all_link }}">{{ 'View all' | t }} →</a>{% endif %}
  </div>
  <div class="evs__strip">
  {% for e in events %}
    <a class="evs__card" href="{{ e.url }}">
      <span class="evs__date">{{ e.startDate | date: 'day' }}</span>
      <span class="evs__title">{{ e.title }}</span>
      {% if e.venue %}<span class="evs__meta">📍 {{ e.venue }}</span>{% endif %}
      {% if e.startTime %}<span class="evs__meta">🕘 {{ e.startTime }}</span>{% endif %}
    </a>
  {% else %}
    <p class="evs__empty">{{ 'No upcoming events' | t }}</p>
  {% endfor %}
  </div>
</div>
`,
  css: `.evs__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.evs__head h2 { margin: 0; font-family: var(--site-heading-font); font-size: 1.5rem; }
.evs__head a { color: var(--site-primary-text, var(--site-primary)); font-weight: 600; text-decoration: none; }
.evs__strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(220px, 1fr); gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
.evs__card { scroll-snap-align: start; display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: var(--site-radius); border: 1px solid var(--site-border); background: var(--site-surface); color: var(--site-text); text-decoration: none; transition: transform .15s ease, box-shadow .15s ease; }
.evs__card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(15, 23, 42, .08); }
.evs__date { align-self: flex-start; padding: 4px 10px; border-radius: 999px; background: var(--site-primary); color: var(--site-on-primary); font-weight: 700; font-size: .85rem; }
.evs__title { font-weight: 700; line-height: 1.35; }
.evs__meta { font-size: .85rem; color: var(--site-muted); }
.evs__empty { color: var(--site-muted); }
@media (prefers-reduced-motion: reduce) { .evs__card { transition: none; } }
`,
  js: '',
};

const resultHighlights: StarterModule = {
  key: 'result-highlights',
  name: 'Result highlights',
  nameBn: 'ফলাফলের হাইলাইট',
  description: 'Pass rate and GPA 5 per class for the latest published exams (small classes are hidden automatically for privacy).',
  category: 'results',
  icon: 'trophy',
  fields: [
    { key: 'heading', type: 'text', label: 'Heading', bn: true, default: { en: 'Result highlights', bn: 'ফলাফলের হাইলাইট' } },
    { key: 'exams', type: 'number', label: 'How many exams', default: 1, min: 1, max: 4 },
    { key: 'show_gpa5', type: 'boolean', label: 'Show GPA 5 count', default: true },
  ],
  template: `{% collection "exams" limit:module.exams sort:"-endDate" include:"classSummaries" as exams %}
<div class="rh">
  {% if module.heading %}<h2 class="rh__title">{{ module.heading }}</h2>{% endif %}
  {% for ex in exams %}
    <h3 class="rh__exam">{{ ex.name }}{% if ex.endDate %} <small>· {{ ex.endDate | date: 'month' }}</small>{% endif %}</h3>
    <div class="rh__grid">
    {% for c in ex.classSummaries %}{% unless c.suppressed %}
      <div class="rh__card">
        <span class="rh__class">{{ c.className }}</span>
        {% if c.passRate %}<span class="rh__big">{{ c.passRate | num: 1 }}%</span><span class="rh__label">{{ 'Pass rate' | t }}</span>
          <span class="rh__bar"><i style="width: {{ c.passRate }}%"></i></span>{% endif %}
        <span class="rh__row">{{ 'Appeared' | t }}: <b>{{ c.appeared | num }}</b></span>
        {% if module.show_gpa5 and c.gpa5Count %}<span class="rh__row">{{ 'GPA 5' | t }}: <b>{{ c.gpa5Count | num }}</b></span>{% endif %}
      </div>
    {% endunless %}{% endfor %}
    </div>
  {% else %}
    <p class="rh__empty">{{ 'No results published yet' | t: 'এখনো কোনো ফলাফল প্রকাশিত হয়নি' }}</p>
  {% endfor %}
</div>
`,
  css: `.rh__title { margin: 0 0 6px; font-family: var(--site-heading-font); font-size: 1.6rem; }
.rh__exam { margin: 18px 0 12px; font-size: 1.1rem; }
.rh__exam small { color: var(--site-muted); font-weight: 400; }
.rh__grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.rh__card { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: var(--site-radius); background: var(--site-surface); border: 1px solid var(--site-border); }
.rh__class { font-weight: 700; }
.rh__big { font-size: 2rem; font-weight: 800; line-height: 1.1; color: var(--site-primary-text, var(--site-primary)); }
.rh__label, .rh__row { font-size: .85rem; color: var(--site-muted); }
.rh__row b { color: var(--site-text); }
.rh__bar { display: block; height: 6px; border-radius: 999px; background: var(--site-border); overflow: hidden; margin: 4px 0; }
.rh__bar i { display: block; height: 100%; background: var(--site-primary); border-radius: inherit; }
.rh__empty { color: var(--site-muted); }
`,
  js: '',
};

const admissionBanner: StarterModule = {
  key: 'admission-banner',
  name: 'Admission banner',
  nameBn: 'ভর্তি ব্যানার',
  description: 'A bold banner with a live countdown to the admission deadline and an apply button (uses a little JavaScript, so it runs in the safe sandbox).',
  category: 'admissions',
  icon: 'graduation',
  fields: [
    { key: 'eyebrow', type: 'text', label: 'Small label', bn: true, default: { en: 'Admissions open', bn: 'ভর্তি চলছে' } },
    { key: 'title', type: 'text', label: 'Title', bn: true, default: { en: 'Admission 2027 is open for Class 6–9', bn: '২০২৭ শিক্ষাবর্ষে ষষ্ঠ–নবম শ্রেণিতে ভর্তি চলছে' } },
    { key: 'text', type: 'textarea', label: 'Text', bn: true, default: { en: 'Apply online before the deadline. Seats are limited.', bn: 'শেষ তারিখের আগে অনলাইনে আবেদন করুন। আসন সীমিত।' } },
    { key: 'deadline', type: 'date', label: 'Deadline', default: '' },
    { key: 'button_label', type: 'text', label: 'Button text', bn: true, default: { en: 'Apply now', bn: 'এখনই আবেদন করুন' } },
    { key: 'button_link', type: 'link', label: 'Button link', default: '/admissions' },
    { key: 'image', type: 'image', label: 'Image (optional)', default: '' },
  ],
  template: `<section class="ab{% if module.image %} ab--img{% endif %}">
  <div class="ab__body">
    {% if module.eyebrow %}<span class="ab__eyebrow">{{ module.eyebrow }}</span>{% endif %}
    <h2 class="ab__title">{{ module.title }}</h2>
    {% if module.text %}<p class="ab__text">{{ module.text }}</p>{% endif %}
    {% if module.deadline %}
      {% assign left = module.deadline | days_until %}
      <p class="ab__deadline">{{ 'Admission deadline' | t }}: <b>{{ module.deadline | date: 'long' }}</b></p>
      <div class="ab__count" data-deadline="{{ module.deadline }}" data-closed="{{ 'Deadline passed' | t }}">
        <span><b data-cd="d">{% if left > 0 %}{{ left | num }}{% else %}{{ 0 | num }}{% endif %}</b><small>{{ 'Days' | t }}</small></span>
        <span><b data-cd="h">--</b><small>{{ 'Hours' | t }}</small></span>
        <span><b data-cd="m">--</b><small>{{ 'Minutes' | t }}</small></span>
        <span><b data-cd="s">--</b><small>{{ 'Seconds' | t }}</small></span>
      </div>
    {% endif %}
    {% if module.button_link %}<a class="ab__btn" href="{{ module.button_link }}">{{ module.button_label }}</a>{% endif %}
  </div>
  {% if module.image %}<img class="ab__img" src="{{ module.image | img: 900 }}" alt="">{% endif %}
</section>
`,
  css: `body { background: transparent; }
.ab { display: grid; gap: 24px; align-items: center; padding: 32px; border-radius: var(--site-radius); background: linear-gradient(135deg, var(--site-primary), var(--site-accent, var(--site-primary))); color: var(--site-on-primary); }
.ab--img { grid-template-columns: 1.3fr 1fr; }
.ab__eyebrow { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,.18); font-weight: 600; font-size: .85rem; }
.ab__title { margin: 12px 0 8px; font-family: var(--site-heading-font); font-size: clamp(1.5rem, 3vw, 2.2rem); line-height: 1.2; }
.ab__text { margin: 0 0 12px; opacity: .92; }
.ab__deadline { margin: 0 0 10px; }
.ab__count { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.ab__count span { min-width: 72px; padding: 10px 8px; border-radius: 12px; background: rgba(0,0,0,.18); text-align: center; }
.ab__count b { display: block; font-size: 1.6rem; line-height: 1.1; }
.ab__count small { font-size: .75rem; opacity: .85; }
.ab__btn { display: inline-block; padding: 12px 22px; border-radius: 999px; background: #ffffff; color: #0f172a; font-weight: 700; text-decoration: none; }
.ab__btn:hover { background: #f1f5f9; }
.ab__img { width: 100%; max-height: 320px; object-fit: cover; border-radius: calc(var(--site-radius) * .8); }
.ab.is-closed .ab__count { opacity: .6; }
@media (max-width: 720px) { .ab { padding: 22px; } .ab--img { grid-template-columns: 1fr; } }
`,
  js: `// Live countdown. SITE.lang tells us whether to use Bangla digits.
(function () {
  var box = document.querySelector('[data-deadline]');
  if (!box) return;
  var end = new Date(box.getAttribute('data-deadline') + 'T23:59:59+06:00').getTime();
  if (!isFinite(end)) return;
  var bn = window.SITE && SITE.lang === 'bn';
  var DIGITS = '০১২৩৪৫৬৭৮৯';
  function fmt(n, pad) {
    var s = String(n);
    if (pad && s.length < 2) s = '0' + s;
    return bn ? s.replace(/[0-9]/g, function (d) { return DIGITS[Number(d)]; }) : s;
  }
  function set(k, v, pad) {
    var el = box.querySelector('[data-cd="' + k + '"]');
    if (el) el.textContent = fmt(v, pad);
  }
  var timer;
  function tick() {
    var left = Math.max(0, end - Date.now());
    set('d', Math.floor(left / 864e5), false);
    set('h', Math.floor((left % 864e5) / 36e5), true);
    set('m', Math.floor((left % 36e5) / 6e4), true);
    set('s', Math.floor((left % 6e4) / 1e3), true);
    if (left <= 0) {
      clearInterval(timer);
      var sec = document.querySelector('.ab');
      if (sec) sec.classList.add('is-closed');
    }
  }
  tick();
  timer = setInterval(tick, 1000);
})();
`,
};

const faqAccordion: StarterModule = {
  key: 'faq-accordion',
  name: 'FAQ accordion',
  nameBn: 'প্রশ্নোত্তর (FAQ)',
  description: 'Questions and answers that open and close (no JavaScript; answers support simple **Markdown**).',
  category: 'content',
  icon: 'help',
  fields: [
    { key: 'heading', type: 'text', label: 'Heading', bn: true, default: { en: 'Frequently asked questions', bn: 'সচরাচর জিজ্ঞাসা' } },
    { key: 'intro', type: 'textarea', label: 'Intro (optional)', bn: true, default: '' },
    {
      key: 'items', type: 'repeater', label: 'Questions', itemLabel: 'Question', maxItems: 30,
      fields: [
        { key: 'question', type: 'text', label: 'Question', bn: true },
        { key: 'answer', type: 'textarea', label: 'Answer (Markdown allowed)', bn: true },
      ],
      default: [
        { question: 'When does admission start?', questionBn: 'ভর্তি কখন শুরু হয়?', answer: 'Admission usually opens in **November**. Watch the notice board.', answerBn: 'সাধারণত **নভেম্বর** মাসে ভর্তি শুরু হয়। নোটিশ বোর্ড দেখুন।' },
        { question: 'Is there a school bus?', questionBn: 'স্কুল বাস আছে কি?', answer: 'Yes. See the transport page for routes and fees.', answerBn: 'হ্যাঁ। রুট ও ফির জন্য পরিবহন পেজ দেখুন।' },
      ],
    },
    { key: 'open_first', type: 'boolean', label: 'Open the first question', default: true },
  ],
  template: `<div class="faq">
  {% if module.heading %}<h2 class="faq__title">{{ module.heading }}</h2>{% endif %}
  {% if module.intro %}<p class="faq__intro">{{ module.intro }}</p>{% endif %}
  <div class="faq__list">
  {% for q in module.items %}{% if q.question %}
    <details class="faq__item"{% if forloop.first and module.open_first %} open{% endif %}>
      <summary>{{ q.question }}</summary>
      <div class="faq__answer">{{ q.answer | markdown }}</div>
    </details>
  {% endif %}{% endfor %}
  </div>
</div>
`,
  css: `.faq__title { margin: 0 0 6px; font-family: var(--site-heading-font); font-size: 1.6rem; }
.faq__intro { margin: 0 0 16px; color: var(--site-muted); }
.faq__list { display: flex; flex-direction: column; gap: 10px; }
.faq__item { border: 1px solid var(--site-border); border-radius: var(--site-radius); background: var(--site-surface); }
.faq__item summary { cursor: pointer; list-style: none; padding: 14px 44px 14px 16px; font-weight: 600; position: relative; }
.faq__item summary::-webkit-details-marker { display: none; }
.faq__item summary::after { content: '+'; position: absolute; right: 16px; top: 50%; transform: translateY(-50%); font-size: 1.3rem; color: var(--site-primary-text, var(--site-primary)); }
.faq__item[open] summary::after { content: '–'; }
.faq__item summary:focus-visible { outline: 2px solid var(--site-primary); outline-offset: 2px; border-radius: var(--site-radius); }
.faq__answer { padding: 0 16px 14px; color: var(--site-text); }
.faq__answer p { margin: 0 0 8px; }
`,
  js: '',
};

const feeCards: StarterModule = {
  key: 'fee-cards',
  name: 'Pricing / fee cards',
  nameBn: 'ফি / মূল্য কার্ড',
  description: 'Side-by-side fee or package cards with ৳ prices, feature lists and a highlighted option.',
  category: 'fees',
  icon: 'wallet',
  fields: [
    { key: 'heading', type: 'text', label: 'Heading', bn: true, default: { en: 'Fees', bn: 'ফি' } },
    { key: 'intro', type: 'textarea', label: 'Intro (optional)', bn: true, default: '' },
    {
      key: 'plans', type: 'repeater', label: 'Cards', itemLabel: 'Card', maxItems: 6,
      fields: [
        { key: 'name', type: 'text', label: 'Name', bn: true },
        { key: 'price', type: 'number', label: 'Price (৳)', min: 0 },
        { key: 'period', type: 'select', label: 'Per', default: 'month', options: [{ value: 'month', label: 'per month' }, { value: 'year', label: 'per year' }, { value: 'once', label: 'one time' }] },
        { key: 'features', type: 'textarea', label: 'Features (one per line)', bn: true },
        { key: 'highlight', type: 'boolean', label: 'Highlight this card', default: false },
        { key: 'button_label', type: 'text', label: 'Button text', bn: true },
        { key: 'button_link', type: 'link', label: 'Button link' },
      ],
      default: [
        { name: 'Primary (Class 1–5)', nameBn: 'প্রাথমিক (১ম–৫ম)', price: 1500, period: 'month', features: 'Tuition\nLibrary\nSports', featuresBn: 'টিউশন\nলাইব্রেরি\nখেলাধুলা', highlight: false, button_label: 'Apply', button_labelBn: 'আবেদন করুন', button_link: '/admissions' },
        { name: 'Secondary (Class 6–10)', nameBn: 'মাধ্যমিক (৬ষ্ঠ–১০ম)', price: 2200, period: 'month', features: 'Tuition\nScience labs\nComputer lab\nSports', featuresBn: 'টিউশন\nবিজ্ঞানাগার\nকম্পিউটার ল্যাব\nখেলাধুলা', highlight: true, button_label: 'Apply', button_labelBn: 'আবেদন করুন', button_link: '/admissions' },
        { name: 'Admission fee', nameBn: 'ভর্তি ফি', price: 5000, period: 'once', features: 'Registration\nID card\nDiary and syllabus', featuresBn: 'নিবন্ধন\nআইডি কার্ড\nডায়েরি ও সিলেবাস', highlight: false, button_label: '', button_labelBn: '', button_link: '' },
      ],
    },
  ],
  template: `<div class="fees">
  {% if module.heading %}<h2 class="fees__title">{{ module.heading }}</h2>{% endif %}
  {% if module.intro %}<p class="fees__intro">{{ module.intro }}</p>{% endif %}
  <div class="fees__grid">
  {% for p in module.plans %}
    <div class="fees__card{% if p.highlight %} is-hl{% endif %}">
      {% if p.highlight %}<span class="fees__badge">{{ 'Most popular' | t }}</span>{% endif %}
      <h3>{{ p.name }}</h3>
      {% if p.price != nil %}<p class="fees__price">{{ p.price | money }}<small> {% case p.period %}{% when 'year' %}{{ 'per year' | t }}{% when 'once' %}{{ 'one time' | t }}{% else %}{{ 'per month' | t }}{% endcase %}</small></p>{% endif %}
      {% if p.features %}
        {% assign lines = p.features | newline_to_br | split: '<br />' %}
        <ul>{% for l in lines %}{% assign item = l | strip %}{% if item != '' %}<li>{{ item }}</li>{% endif %}{% endfor %}</ul>
      {% endif %}
      {% if p.button_label and p.button_link %}<a class="fees__btn" href="{{ p.button_link }}">{{ p.button_label }}</a>{% endif %}
    </div>
  {% endfor %}
  </div>
</div>
`,
  css: `.fees__title { margin: 0 0 6px; font-family: var(--site-heading-font); font-size: 1.6rem; text-align: center; }
.fees__intro { margin: 0 auto 18px; max-width: 640px; text-align: center; color: var(--site-muted); }
.fees__grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); align-items: stretch; }
.fees__card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 22px; border-radius: var(--site-radius); border: 1px solid var(--site-border); background: var(--site-surface); }
.fees__card.is-hl { border: 2px solid var(--site-primary); box-shadow: 0 10px 30px rgba(15, 23, 42, .08); }
.fees__badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); padding: 3px 12px; border-radius: 999px; background: var(--site-primary); color: var(--site-on-primary); font-size: .75rem; font-weight: 700; white-space: nowrap; }
.fees__card h3 { margin: 0; font-size: 1.1rem; }
.fees__price { margin: 0; font-size: 1.9rem; font-weight: 800; color: var(--site-primary-text, var(--site-text)); }
.fees__price small { font-size: .85rem; font-weight: 500; color: var(--site-muted); }
.fees__card ul { margin: 4px 0 8px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.fees__card li { padding-left: 22px; position: relative; }
.fees__card li::before { content: '✓'; position: absolute; left: 0; color: var(--site-primary-text, var(--site-primary)); font-weight: 700; }
.fees__btn { margin-top: auto; text-align: center; padding: 10px 16px; border-radius: 999px; background: var(--site-primary); color: var(--site-on-primary); font-weight: 600; text-decoration: none; }
`,
  js: '',
};

export const STARTER_MODULES: StarterModule[] = [teacherSpotlight, noticeTicker, eventStrip, resultHighlights, admissionBanner, faqAccordion, feeCards];

/** The import document for a starter (what `POST /sites/modules/import` takes). */
export function starterDoc(s: StarterModule) {
  return { format: 'peoplenit-site-module', formatVersion: 1, module: { ...s } };
}
