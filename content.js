// Ruler + Carbon inspector: hover an element to see its size and Carbon v11
// tokens, click two elements to measure the space between them, shift+click
// to pin a token card. Runs in every frame; each frame handles its own elements.
(() => {
  if (window.__ruler) return;

  const COLORS = {
    hover: '#0f62fe',
    a: '#ff832b',
    b: '#ee5396',
    line: '#da1e28',
    pin: '#0f62fe',
    margin: '#f1c21b',
    padding: '#42be65',
    grid: '#fa4d56',
  };

  const SPECS = ['typography', 'color', 'spacing', 'border', 'motion'];
  const SPEC_KEYS = { t: 'typography', c: 'color', s: 'spacing', b: 'border', m: 'motion' };

  const state = {
    enabled: false,
    raw: null, // deepest element under the pointer
    hover: null, // element that will be picked; ArrowUp/Down moves it
    history: [], // children walked past with ArrowUp, for ArrowDown
    a: null,
    b: null,
    pointer: { x: 0, y: 0 },
    inside: false, // pointer is in this frame, not in a child or parent frame
    overPin: false, // pointer is over a pinned card
    specs: new Set(['typography', 'color']),
    pins: [], // { el, card, x, y }
    pinHover: null,
    drag: null, // { pin, dx, dy }
    alt: false, // Alt held: measure from A to the hovered element
    frozen: null, // element locked in the panel while the page is usable
    grid: false,
  };

  // ---------------------------------------------------------------------------
  // Carbon v11 reference values, used when the page doesn't say which token it
  // used (no var(--cds-*) in its CSS)

  // [font-size, font-weight, line-height, letter-spacing] in px
  const TYPE_SCALE = {
    'label-01': [12, 400, 16, 0.32],
    'helper-text-01': [12, 400, 16, 0.32],
    'code-01': [12, 400, 16, 0.32],
    'label-02': [14, 400, 18, 0.16],
    'helper-text-02': [14, 400, 18, 0.16],
    'code-02': [14, 400, 20, 0.32],
    'body-compact-01': [14, 400, 18, 0.16],
    'body-compact-02': [16, 400, 22, 0],
    'body-01': [14, 400, 20, 0.16],
    'body-02': [16, 400, 24, 0],
    'heading-compact-01': [14, 600, 18, 0.16],
    'heading-compact-02': [16, 600, 22, 0],
    'heading-01': [14, 600, 20, 0.16],
    'heading-02': [16, 600, 24, 0],
    'heading-03': [20, 400, 28, 0],
    'heading-04': [28, 400, 36, 0],
    'heading-05': [32, 400, 40, 0],
    'heading-06': [42, 300, 50, 0],
    'heading-07': [54, 300, 64, 0],
  };

  // Measured px to the whole px it was meant to be. Chrome lays out in 1/64px
  // and, at browser zoom, snaps edges to device pixels, so a 16px gap can
  // measure 15.98. Within half a device pixel counts; values shown stay exact.
  const snap = (value) => {
    const whole = Math.round(value);
    const tolerance = Math.min(0.25, Math.max(1 / 32, 0.5 / devicePixelRatio));
    return Math.abs(value - whole) <= tolerance ? whole : value;
  };

  const SPACING = [2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160];
  const spacingToken = (value) => {
    const i = SPACING.indexOf(snap(Math.abs(value)));
    return i < 0 ? null : `spacing-${String(i + 1).padStart(2, '0')}`;
  };

  // White and g100 theme values. Pages built with Carbon v11 expose the real
  // values as --cds-* custom properties, which are read first.
  const FALLBACK_COLORS = {
    'text-primary': ['#161616', '#f4f4f4'],
    'text-secondary': ['#525252', '#c6c6c6'],
    'text-helper': ['#6f6f6f', '#a8a8a8'],
    'text-on-color': ['#ffffff'],
    'text-error': ['#da1e28', '#fa4d56'],
    'link-primary': ['#0f62fe', '#78a9ff'],
    background: ['#ffffff', '#161616'],
    'layer-01': ['#f4f4f4', '#262626'],
    'layer-02': ['#ffffff', '#393939'],
    'field-01': ['#f4f4f4', '#262626'],
    'border-subtle-01': ['#c6c6c6', '#393939'],
    'border-strong-01': ['#8d8d8d', '#6f6f6f'],
    'button-primary': ['#0f62fe'],
    'support-error': ['#da1e28', '#fa4d56'],
    'support-success': ['#24a148', '#42be65'],
    'support-warning': ['#f1c21b'],
  };

  // When several tokens share a value, prefer the one meant for that use
  const ROLES = {
    text: ['text-', 'link-', 'icon-', 'support-'],
    background: ['background', 'layer-', 'field-', 'button-', 'interactive', 'support-'],
    border: ['border-', 'focus', 'interactive', 'support-'],
    focus: ['focus', 'border-', 'interactive', 'support-'],
  };

  // Carbon v12 corner radii in px. border-radius-max (999999px) makes pills.
  const RADII = {
    0: 'border-radius-00',
    2: 'border-radius-02',
    4: 'border-radius-04',
    8: 'border-radius-08',
    16: 'border-radius-16',
    24: 'border-radius-24',
  };
  const RADIUS_MAX = 999999;
  const radiusToken = (value) =>
    value >= RADIUS_MAX ? 'border-radius-max' : RADII[snap(value)] ?? null;

  // Control heights (buttons, inputs, list boxes) and icon sizes
  const CONTROL_SIZES = { 24: 'xs', 32: 'sm', 40: 'md', 48: 'lg', 64: 'xl', 80: '2xl' };
  const ICON_SIZES = [16, 20, 24, 32];

  // Motion: durations in ms and cubic-bezier easings
  const DURATIONS = {
    70: 'duration-fast-01',
    110: 'duration-fast-02',
    150: 'duration-moderate-01',
    240: 'duration-moderate-02',
    400: 'duration-slow-01',
    700: 'duration-slow-02',
  };
  const EASINGS = {
    '0.2, 0, 0.38, 0.9': 'standard productive',
    '0.4, 0.14, 0.3, 1': 'standard expressive',
    '0, 0, 0.38, 0.9': 'entrance productive',
    '0, 0, 0.3, 1': 'entrance expressive',
    '0.2, 0, 1, 0.9': 'exit productive',
    '0.4, 0.14, 1, 1': 'exit expressive',
  };

  // 2x grid: [name, min width, columns, margin]; gutters are 32px
  const BREAKPOINTS = [
    ['max', 1584, 16, 24],
    ['xlg', 1312, 16, 16],
    ['lg', 1056, 16, 16],
    ['md', 672, 8, 16],
    ['sm', 0, 4, 0],
  ];

  // ---------------------------------------------------------------------------
  // Overlay, isolated from page styles in a shadow root

  const host = document.createElement('ruler-overlay');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .layer, .pins { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
        font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .box { position: fixed; box-sizing: border-box; }
      .fill { position: fixed; box-sizing: border-box; display: flex; align-items: center;
        justify-content: center; overflow: hidden; font-size: 10px; }
      .badge { padding: 0 3px; border-radius: 2px; line-height: 12px; color: #161616; }
      .col { position: fixed; top: 0; bottom: 0; background: ${COLORS.grid}14;
        box-shadow: inset 1px 0 ${COLORS.grid}40, inset -1px 0 ${COLORS.grid}40; }
      .line { position: fixed; background: ${COLORS.line}; }
      .wires { position: fixed; inset: 0; width: 100%; height: 100%; overflow: visible; }
      /* Values sit above every line and box, whatever order they're drawn in */
      .tag { position: fixed; z-index: 1; padding: 1px 4px; border-radius: 3px; color: #fff;
        white-space: nowrap; transform: translate(-50%, -50%); }
      .name { position: fixed; padding: 1px 4px; border-radius: 3px 3px 3px 0;
        color: #fff; white-space: nowrap; transform: translateY(-100%); }
      /* Panel colors contrast with the page: dark by default, light over dark areas */
      :host { --bg: rgba(22, 22, 22, 0.94); --fg: #f4f4f4; --strong: #fff; --muted: #a8a8a8;
        --soft: #c6c6c6; --rule: #393939; --accent: #78a9ff; --ring: #6f6f6f;
        --shadow: rgba(0, 0, 0, 0.3); --ok: #42be65; --near: #f1c21b; --bad: #fa4d56; }
      :host(.light) { --bg: rgba(255, 255, 255, 0.96); --fg: #161616; --strong: #000; --muted: #6f6f6f;
        --soft: #525252; --rule: #e0e0e0; --accent: #0f62fe; --ring: #8d8d8d;
        --shadow: rgba(0, 0, 0, 0.18); --ok: #24a148; --near: #d2a106; --bad: #da1e28; }
      /* The panel sits above the value tags (z-index 1) it would otherwise sit under */
      .panel { z-index: 2; }
      .panel, .card { position: fixed; box-sizing: border-box; min-width: 220px; max-width: 320px;
        padding: 8px 10px; border-radius: 6px; background: var(--bg);
        color: var(--fg); box-shadow: 0 0 0 1px var(--rule), 0 2px 8px var(--shadow); }
      .card { pointer-events: auto; border: 1px solid ${COLORS.pin}; }
      .head { display: flex; align-items: center; gap: 6px; margin: -2px 0 2px;
        cursor: move; user-select: none; }
      .head .title { flex: 1; min-width: 0; }
      .head button { all: unset; cursor: pointer; padding: 0 5px; border-radius: 3px;
        color: var(--soft); }
      .head button:hover { background: var(--rule); color: var(--strong); }
      b { color: var(--strong); font-weight: 600; }
      .title { color: var(--accent); }
      /* Long selectors scroll back and forth instead of wrapping */
      .marquee { display: block; flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; }
      .marquee > span { display: inline-block; }
      @keyframes ruler-marquee {
        0%, 15% { transform: translateX(0); }
        85%, 100% { transform: translateX(var(--shift)); }
      }
      .component { color: var(--soft); }
      .row { display: flex; justify-content: space-between; gap: 16px; }
      .row > span { white-space: nowrap; }
      .row b { text-align: right; overflow-wrap: anywhere; }
      .sub { color: var(--muted); text-align: right; }
      .sec { margin-top: 6px; padding-top: 4px; border-top: 1px solid var(--rule);
        color: var(--muted); letter-spacing: 0.5px; text-transform: uppercase; font-size: 10px; }
      .hint { margin-top: 6px; padding-top: 4px; border-top: 1px solid var(--rule);
        color: var(--muted); }
      .prompt { margin-top: 6px; color: var(--fg); }
      .dim { color: var(--muted); font-weight: 400; }
      .swatch { display: inline-block; width: 8px; height: 8px; margin-right: 4px;
        border-radius: 2px; box-shadow: 0 0 0 1px var(--ring); vertical-align: -1px; }
      .dot { display: inline-block; width: 6px; height: 6px; margin-right: 5px;
        border-radius: 50%; vertical-align: 1px; }
      .dot.token { background: var(--ok); }
      .dot.match { background: var(--near); }
      .dot.custom { background: var(--bad); }
    </style>
    <div class="layer"></div>
    <div class="pins"></div>`;
  const layer = root.querySelector('.layer');
  const pinsLayer = root.querySelector('.pins');

  const fmt = (n) => `${Math.round(n * 100) / 100}`;
  const px = (value) => fmt(parseFloat(value) || 0);
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const parentOf = (el) =>
    el.parentElement ??
    (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);

  const describe = (el) => {
    let name = el.tagName.toLowerCase();
    if (el.id) name += `#${el.id}`;
    const cls = [...el.classList].find((c) => !c.startsWith('ruler')) ?? '';
    if (cls) name += `.${cls}`;
    if (el.getRootNode() instanceof ShadowRoot) name += ' (shadow)';
    return name;
  };

  const add = (className, style, text, parent = layer) => {
    const node = document.createElement('div');
    node.className = className;
    Object.assign(node.style, style);
    if (text != null) node.textContent = text;
    parent.append(node);
    return node;
  };

  // ---------------------------------------------------------------------------
  // Which CSS declaration set a property: lets us report the token the author
  // used (var(--cds-text-primary)) instead of guessing from the value

  // root (document or shadow root) -> Map(props key -> style rules that set them)
  let ruleIndex = new WeakMap();
  // element -> inspected specs
  let specCache = new WeakMap();

  const conditionHolds = (rule) => {
    try {
      if (rule instanceof CSSMediaRule) return matchMedia(rule.media.mediaText).matches;
      if (rule instanceof CSSSupportsRule) return CSS.supports(rule.conditionText);
    } catch {
      return false;
    }
    return true;
  };

  // Storybook and CSS-in-JS add stylesheets and rules as you navigate. A cheap
  // signature (rule counts per sheet) tells when the index has gone stale.
  const indexedScopes = new Set();
  let stylesSignature = '';
  let stylesCheckedAt = -Infinity;
  const sheetsOf = (scope) => [...(scope.styleSheets ?? []), ...(scope.adoptedStyleSheets ?? [])];
  const signatureOf = (scope) =>
    sheetsOf(scope)
      .map((sheet) => {
        try {
          return sheet.cssRules.length;
        } catch {
          return 'x';
        }
      })
      .join();
  const checkStyles = () => {
    const now = performance.now();
    if (now - stylesCheckedAt < 500) return;
    stylesCheckedAt = now;
    const signature = [document, ...indexedScopes].map(signatureOf).join('|');
    if (signature === stylesSignature) return;
    stylesSignature = signature;
    ruleIndex = new WeakMap();
    specCache = new WeakMap();
  };

  const rulesSetting = (scope, props) => {
    indexedScopes.add(scope);
    if (!ruleIndex.has(scope)) {
      const all = [];
      const walk = (rules) => {
        for (const rule of rules) {
          if (!conditionHolds(rule)) continue;
          if (rule.selectorText != null && rule.style) all.push(rule);
          if (rule.cssRules) walk(rule.cssRules);
          if (rule.styleSheet) {
            try {
              walk(rule.styleSheet.cssRules); // @import
            } catch {
              // cross-origin import
            }
          }
        }
      };
      for (const sheet of sheetsOf(scope)) {
        try {
          walk(sheet.cssRules);
        } catch {
          // cross-origin stylesheet
        }
      }
      ruleIndex.set(scope, new Map([['', all]]));
    }
    const byProps = ruleIndex.get(scope);
    const key = props.join();
    if (!byProps.has(key)) {
      byProps.set(
        key,
        byProps.get('').filter((rule) => props.some((p) => rule.style.getPropertyValue(p)))
      );
    }
    return byProps.get(key);
  };

  // Split on a separator outside parentheses: "a, :is(b, c)" -> ["a", ":is(b, c)"]
  const splitTop = (text, separator) => {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (depth === 0 && separator.test(ch)) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
  };

  // Rough specificity (ids, classes, tags) of the matching selector, or -1
  const specificity = (el, selectorText) => {
    let best = -1;
    for (const selector of splitTop(selectorText, /,/)) {
      try {
        if (!el.matches(selector)) continue;
      } catch {
        continue;
      }
      const s = selector.replace(/:where\([^)]*\)/g, '');
      const ids = (s.match(/#[\w-]+/g) || []).length;
      const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
      const tags = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) || [])
        .length;
      best = Math.max(best, ids * 10000 + classes * 100 + tags);
    }
    return best;
  };

  // The style declaration that wins for any of props on el (inline style first)
  const winningStyle = (el, props) => {
    if (props.some((p) => el.style?.getPropertyValue(p))) return el.style;
    let best = null;
    let bestScore = -1;
    for (const rule of rulesSetting(el.getRootNode(), props)) {
      const score = specificity(el, rule.selectorText);
      if (score >= 0 && score >= bestScore) {
        best = rule.style;
        bestScore = score;
      }
    }
    return best;
  };

  // The first value set, preferring one that uses a variable: a rule like
  // `border: none; border-block-end: 1px solid var(--cds-…)` resets the
  // physical longhands but the logical one is what paints
  const pickValue = (values) => {
    const set = values.filter(Boolean).map((v) => v.trim());
    return set.find((v) => v.includes('var(')) ?? set[0] ?? '';
  };

  const firstValue = (style, props) => pickValue(props.map((p) => style?.getPropertyValue(p)));

  // Declared value for props, walking up for inherited properties
  const declared = (el, props, inherited = false) => {
    for (let node = el; node; node = inherited ? parentOf(node) : null) {
      const value = firstValue(winningStyle(node, props), props);
      if (value && !/^(inherit|unset)$/.test(value)) return value;
    }
    return '';
  };

  const cdsVar = (value) => value.match(/var\(\s*--cds-([\w-]+)/)?.[1] ?? null;

  // One side of a box property, from its longhand or the shorthand
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const SHORTHAND_SIDES = [
    [0, 0, 0, 0],
    [0, 1, 0, 1],
    [0, 1, 2, 1],
    [0, 1, 2, 3],
  ];
  // Carbon v11 mostly writes logical properties (padding-inline,
  // border-block-end). Map a physical side to its logical axis and edge,
  // assuming horizontal writing.
  const logicalSide = (cs, side) => {
    const rtl = cs.direction === 'rtl';
    return [
      ['block', 'start'],
      ['inline', rtl ? 'start' : 'end'],
      ['block', 'end'],
      ['inline', rtl ? 'end' : 'start'],
    ][side];
  };

  const declaredSide = (el, cs, prop, side) => {
    const [axis, edge] = logicalSide(cs, side);
    const longhands = [`${prop}-${SIDES[side]}`, `${prop}-${axis}-${edge}`];
    const axisProp = `${prop}-${axis}`;
    const style = winningStyle(el, [...longhands, axisProp, prop]);
    // padding-inline: start [end]
    const axisParts = splitTop(style?.getPropertyValue(axisProp) ?? '', /\s/);
    const parts = splitTop(style?.getPropertyValue(prop) ?? '', /\s/);
    return pickValue([
      ...longhands.map((p) => style?.getPropertyValue(p)),
      axisParts[edge === 'end' ? axisParts.length - 1 : 0],
      parts[SHORTHAND_SIDES[parts.length - 1]?.[side]],
    ]);
  };

  // One corner's radius, from its longhand, its logical longhand
  // (border-start-end-radius) or the border-radius shorthand
  const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  const declaredCorner = (el, cs, corner) => {
    const [block, inline] = CORNERS[corner].split('-');
    const start = (inline === 'left') !== (cs.direction === 'rtl');
    const longhands = [
      `border-${CORNERS[corner]}-radius`,
      `border-${block === 'top' ? 'start' : 'end'}-${start ? 'start' : 'end'}-radius`,
    ];
    const style = winningStyle(el, [...longhands, 'border-radius']);
    // Horizontal radii only: "4px 8px / 2px" -> 4px 8px
    const parts = splitTop(splitTop(style?.getPropertyValue('border-radius') ?? '', /\//)[0] ?? '', /\s/);
    return pickValue([
      ...longhands.map((p) => style?.getPropertyValue(p)),
      parts[SHORTHAND_SIDES[parts.length - 1]?.[corner]],
    ]);
  };

  // Every property that can set one side's border color, most specific first
  const borderColorProps = (cs, side) => {
    const [axis, edge] = logicalSide(cs, side);
    const s = SIDES[side];
    return [
      `border-${s}-color`,
      `border-${axis}-${edge}-color`,
      `border-${axis}-color`,
      `border-${s}`,
      `border-${axis}-${edge}`,
      `border-${axis}`,
      'border-color',
      'border',
    ];
  };

  // ---------------------------------------------------------------------------
  // Color matching: compare normalized values against the page's --cds-* colors

  const ctx = document.createElement('canvas').getContext('2d');
  const normColor = (value) => {
    // A detached canvas resolves currentColor to black
    if (!value || /currentcolor|inherit/i.test(value)) return null;
    const sentinel = '#010203';
    ctx.fillStyle = sentinel;
    ctx.fillStyle = value.trim();
    const out = ctx.fillStyle;
    return out === sentinel && value.trim().toLowerCase() !== sentinel ? null : out;
  };

  // Normalized color -> token names, from the custom properties in scope at el
  const colorIndex = (el) => {
    const index = new Map();
    const put = (name, value) => {
      const color = normColor(value);
      if (!color) return;
      if (!index.has(color)) index.set(color, []);
      index.get(color).push(name);
    };
    const cs = getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].startsWith('--cds-')) put(cs[i].slice(6), cs.getPropertyValue(cs[i]));
    }
    if (!index.size) {
      for (const [name, values] of Object.entries(FALLBACK_COLORS)) {
        for (const value of values) put(name, value);
      }
    }
    return index;
  };

  const pickName = (names, role) => {
    const score = (name) => {
      const i = ROLES[role].findIndex((prefix) => name.startsWith(prefix));
      return (i < 0 ? 50 : i) + (/hover|active|selected|disabled|inverse/.test(name) ? 100 : 0);
    };
    return [...names].sort((x, y) => score(x) - score(y))[0];
  };

  // status: token (uses var(--cds-*)), match (hard-coded value equal to a
  // token), custom (no token has this value)
  const colorRow = (label, value, decl, index, role) => {
    const row = { label, value, swatch: value };
    const names = index.get(normColor(value));
    // Only trust the variable if it's what actually painted: an inherited
    // declaration can be overridden by browser defaults (buttons, inputs)
    const name = names?.includes(cdsVar(decl)) ? cdsVar(decl) : null;
    if (name) Object.assign(row, { token: name, status: 'token' });
    else if (names) Object.assign(row, { token: pickName(names, role), status: 'match' });
    else row.status = 'custom';
    return row;
  };

  const transparent = (color) => !color || normColor(color) === 'rgba(0, 0, 0, 0)';

  // [r, g, b, alpha] from a computed rgb()/rgba() color, or null
  const parseRgb = (color) => {
    const body = color?.match(/^rgba?\(([^)]+)\)/)?.[1];
    if (!body) return null;
    const [r, g, b, a = 1] = body.split(/[\s,/]+/).filter(Boolean).map(Number);
    return [r, g, b, a];
  };

  // WCAG relative luminance, 0 (black) to 1 (white)
  const luminanceOf = (rgb) => {
    const [r, g, b] = rgb.slice(0, 3).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const luminance = (color) => luminanceOf(parseRgb(color) ?? [255, 255, 255]);

  // WCAG contrast of text over its background. Large text (24px, or 18.66px
  // bold) only needs 3:1 for AA.
  const contrastRow = (fg, bg, cs) => {
    const text = parseRgb(fg);
    const back = parseRgb(bg);
    if (!text || !back) return null;
    // Translucent text blends with what's behind it
    const mixed = [0, 1, 2].map((i) => text[i] * text[3] + back[i] * (1 - text[3]));
    const [hi, lo] = [luminanceOf(mixed), luminanceOf(back)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
    const aa = large ? 3 : 4.5;
    const grade = ratio >= (large ? 4.5 : 7) ? 'AAA' : ratio >= aa ? 'AA' : 'fails AA';
    return {
      label: 'Contrast',
      display: `${ratio.toFixed(2)}:1 · ${grade}${large ? ' large' : ''}`,
      status: ratio >= aa ? 'token' : 'custom',
      note: back[3] < 1 ? 'background is translucent' : undefined,
    };
  };

  const hasOwnText = (el) =>
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());

  // Whether the area under the pointer looks dark, from the first mostly
  // opaque background behind it. Following the pointer handles pages with
  // light and dark regions (Storybook's dark sidebar next to a white canvas,
  // Carbon's cds--g100 zones). Pages that paint nothing fall back to their
  // color-scheme.
  const pageIsDark = (start) => {
    for (let node = start ?? document.body; node; node = parentOf(node)) {
      const bg = getComputedStyle(node).backgroundColor;
      if (transparent(bg)) continue;
      // Skip faint tints such as hover highlights; they don't set the tone
      const alpha = Number(bg.match(/[\d.]+/g)?.[3] ?? 1);
      if (alpha >= 0.5) return luminance(bg) < 0.2;
    }
    const scheme = getComputedStyle(document.documentElement).colorScheme;
    return (
      /dark/.test(scheme) &&
      (!/light/.test(scheme) || matchMedia('(prefers-color-scheme: dark)').matches)
    );
  };

  // ---------------------------------------------------------------------------
  // Specs for one element: { typography: rows, color: rows, ... }

  const typographyRows = (el, cs) => {
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight);
    const lineHeight = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
    const tracking = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
    const value = `${fmt(size)}/${lineHeight == null ? 'normal' : fmt(lineHeight)} · ${weight}${
      tracking ? ` · ${fmt(tracking)}` : ''
    }`;
    const row = { label: 'Type', value };

    const decl = declared(el, ['font-size', 'font'], true);
    // Same check as colors: the token's size must be the size in use
    const toPx = (v) =>
      parseFloat(v) * (/rem\s*$/.test(v) ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
    const sizeVar = cdsVar(decl);
    const sizeValue = sizeVar && cs.getPropertyValue(`--cds-${sizeVar}`);
    const name =
      sizeVar && (!sizeValue || Math.abs(toPx(sizeValue) - size) < 0.02)
        ? sizeVar.replace(/-font-size$/, '')
        : null;
    const typeClass = [...el.classList]
      .map((c) => c.match(/^cds--type-([\w-]+)$/)?.[1])
      .find(Boolean);
    if (name || typeClass) {
      Object.assign(row, { token: name || typeClass, status: 'token' });
    } else {
      const mono = /mono|courier|consol|menlo/i.test(cs.fontFamily);
      const near = (x, y) => Math.abs(x - y) < 0.02;
      const matches = Object.entries(TYPE_SCALE)
        .filter(([token, [s, w, lh, ls]]) =>
          token.startsWith('code-') === mono &&
          near(s, size) && w === weight && lineHeight != null && near(lh, lineHeight) && near(ls, tracking)
        )
        .map(([token]) => token);
      if (matches.length) Object.assign(row, { token: matches.join(' / '), status: 'match' });
      else row.status = 'custom';
    }
    return [row, { label: 'Family', value: cs.fontFamily.split(',')[0].replace(/["']/g, '') }];
  };

  const colorRows = (el, cs) => {
    const index = colorIndex(el);
    const rows = [colorRow('Text', cs.color, declared(el, ['color'], true), index, 'text')];
    // Transparent backgrounds show whatever is behind; report the first
    // ancestor that paints one
    for (let node = el; node; node = parentOf(node)) {
      const bg = getComputedStyle(node).backgroundColor;
      if (transparent(bg)) continue;
      const row = colorRow(
        'Background',
        bg,
        firstValue(winningStyle(node, ['background-color', 'background']), [
          'background-color',
          'background',
        ]),
        index,
        'background'
      );
      if (node !== el) row.note = `from ${describe(node)}`;
      rows.push(row);
      if (hasOwnText(el)) rows.push(contrastRow(cs.color, bg, cs));
      break;
    }
    if (Number(cs.opacity) < 1) rows.push({ label: 'Opacity', value: cs.opacity });
    return rows.filter(Boolean);
  };

  const collapse4 = ([t, r, b, l]) =>
    r === l ? (t === b ? (t === r ? [t] : [t, r]) : [t, r, b]) : [t, r, b, l];

  const boxRow = (el, cs, prop, label) => {
    const values = SIDES.map((side) => parseFloat(cs.getPropertyValue(`${prop}-${side}`)) || 0);
    if (values.every((v) => v === 0)) return null;
    const names = values.map((v, i) => (v ? cdsVar(declaredSide(el, cs, prop, i)) : null));
    const statuses = values.map((v, i) =>
      !v ? null : names[i] ? 'token' : spacingToken(v) ? 'match' : 'custom'
    );
    const tokens = values.map((v, i) =>
      !v ? '0' : names[i] ? `$${names[i]}` : spacingToken(v) ? `$${spacingToken(v)}` : `${fmt(v)}px`
    );
    const status = statuses.includes('custom') ? 'custom' : statuses.includes('match') ? 'match' : 'token';
    return {
      label,
      value: collapse4(values.map(fmt)).join(' '),
      token: collapse4(tokens).join(' '),
      status,
      raw: true, // token already carries the $
    };
  };

  const spacingRows = (el, cs) => {
    const rows = [boxRow(el, cs, 'padding', 'Padding'), boxRow(el, cs, 'margin', 'Margin')];
    if (/flex|grid/.test(cs.display)) {
      for (const [prop, label] of [
        ['row-gap', 'Row gap'],
        ['column-gap', 'Column gap'],
      ]) {
        const v = parseFloat(cs.getPropertyValue(prop));
        if (!v) continue;
        const name = cdsVar(declared(el, [prop, 'gap']));
        const match = spacingToken(v);
        rows.push({
          label,
          value: fmt(v),
          token: name || match,
          status: name ? 'token' : match ? 'match' : 'custom',
        });
      }
    }
    return rows.filter(Boolean);
  };

  const borderRows = (el, cs) => {
    const rows = [];
    const index = colorIndex(el);
    const sides = SIDES.filter(
      (s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 &&
        !['none', 'hidden'].includes(cs.getPropertyValue(`border-${s}-style`))
    );
    if (sides.length) {
      const side = sides[0];
      const sig = (s) =>
        ['width', 'style', 'color'].map((k) => cs.getPropertyValue(`border-${s}-${k}`)).join();
      const mixed = sides.some((s) => sig(s) !== sig(side));
      const color = cs.getPropertyValue(`border-${side}-color`);
      const row = colorRow(
        sides.length === 4 && !mixed ? 'Border' : `Border ${mixed ? side : sides.join('/')}`,
        color,
        declared(el, borderColorProps(cs, SIDES.indexOf(side))),
        index,
        'border'
      );
      row.note = `${px(cs.getPropertyValue(`border-${side}-width`))}px ${cs.getPropertyValue(
        `border-${side}-style`
      )}`;
      rows.push(row);
    }
    // Radius, matched against the v12 radius scale like spacing is
    const radii = CORNERS.map((c) => cs.getPropertyValue(`border-${c}-radius`).trim());
    const sizes = radii.map((r) => (r.includes('%') ? null : parseFloat(r) || 0));
    if (radii.some((r) => parseFloat(r) > 0)) {
      const names = radii.map((r, i) => (parseFloat(r) > 0 ? cdsVar(declaredCorner(el, cs, i)) : null));
      const statuses = sizes.map((v, i) =>
        names[i] ? 'token' : v === 0 ? null : v != null && radiusToken(v) ? 'match' : 'custom'
      );
      const tokens = sizes.map((v, i) =>
        names[i] ? `$${names[i]}` : v === 0 ? '0' : v != null && radiusToken(v) ? `$${radiusToken(v)}` : radii[i]
      );
      rows.push({
        label: 'Radius',
        value: collapse4(sizes.map((v, i) => (v == null ? radii[i] : v >= RADIUS_MAX ? 'pill' : `${fmt(v)}px`))).join(' '),
        token: collapse4(tokens).join(' '),
        status: statuses.includes('custom') ? 'custom' : statuses.includes('match') ? 'match' : 'token',
        raw: true, // token already carries the $
      });
    }

    // Focus rings: Carbon draws them as an outline or an inset box-shadow
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) {
      const row = colorRow('Outline', cs.outlineColor, declared(el, ['outline-color', 'outline']), index, 'focus');
      const offset = parseFloat(cs.outlineOffset);
      row.note = `${px(cs.outlineWidth)}px ${cs.outlineStyle}${offset ? ` · offset ${fmt(offset)}` : ''}`;
      rows.push(row);
    }
    if (cs.boxShadow !== 'none') {
      const color = cs.boxShadow.match(/rgba?\([^)]*\)/)?.[0];
      const shape = cs.boxShadow.replace(/rgba?\([^)]*\)\s*/, '').split(',')[0].trim();
      const decl = declared(el, ['box-shadow']);
      const row = color
        ? colorRow('Shadow', color, decl, index, 'focus')
        : { label: 'Shadow', value: cs.boxShadow };
      if (color) row.note = shape + (cs.boxShadow.includes('),') ? ' · +more' : '');
      rows.push(row);
    }
    return rows;
  };

  const motionRows = (el, cs) => {
    const rows = [];
    const list = (value) => splitTop(value, /,/);
    const props = list(cs.transitionProperty);
    const durations = list(cs.transitionDuration);
    const easings = list(cs.transitionTimingFunction);
    const declaredVar = cdsVar(declared(el, ['transition-duration', 'transition']));
    const ms = (value) => Math.round(parseFloat(value) * (value.endsWith('ms') ? 1 : 1000));
    const easing = (value) => EASINGS[value.match(/cubic-bezier\(([^)]+)\)/)?.[1].replace(/\s+/g, ' ')];
    props.forEach((prop, i) => {
      const duration = ms(durations[i % durations.length] ?? '0s');
      if (!duration || rows.length >= 4) return;
      const ease = easings[i % easings.length] ?? 'ease';
      const durationToken = declaredVar ?? DURATIONS[duration];
      rows.push({
        label: prop === 'all' ? 'All' : prop,
        value: easing(ease) ?? ease,
        token: durationToken ? `$${durationToken}` : `${duration}ms`,
        status: declaredVar ? 'token' : DURATIONS[duration] && easing(ease) ? 'match' : 'custom',
        raw: true,
      });
    });
    if (cs.animationName !== 'none') {
      const duration = ms(list(cs.animationDuration)[0] ?? '0s');
      rows.push({
        label: 'Animation',
        value: `${cs.animationName} ${duration}ms`,
        token: DURATIONS[duration] ? `$${DURATIONS[duration]}` : null,
        status: DURATIONS[duration] ? 'match' : 'custom',
        raw: true,
      });
    }
    return rows;
  };

  // Carbon size for controls (button, input heights) and icons
  const sizeName = (el, rect) => {
    // Hovering an icon usually lands on its <path>; size the <svg> around it
    const svg = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
    if (svg) {
      const r = svg.getBoundingClientRect();
      const side = snap(r.width);
      return side === snap(r.height) && ICON_SIZES.includes(side) ? `icon ${side}` : null;
    }
    const h = snap(rect.height);
    const control =
      /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ||
      el.tagName.startsWith('CDS-') ||
      [...el.classList].some((c) => /^(cds|bx)--/.test(c));
    return control && CONTROL_SIZES[h] ? `size ${CONTROL_SIZES[h]}` : null;
  };

  // Carbon block name from cds--/bx-- classes or a cds-* web component tag
  const SKIP_BLOCKS = /^(type-|layer|css-grid|col|grid|row|g10|g90|g100|white|layout|visually-hidden|assistive-text)/;
  const component = (el) => {
    const title = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    for (let node = el, depth = 0; node && depth < 8; node = parentOf(node), depth++) {
      if (node.tagName.startsWith('CDS-')) return title(node.tagName.slice(4).toLowerCase());
      for (const cls of node.classList) {
        const block = cls.match(/^(?:cds|bx)--([a-z0-9-]+?)(?:__|--|$)/)?.[1];
        if (block && !SKIP_BLOCKS.test(block)) return title(block);
      }
    }
    return null;
  };

  const inspect = (el) => {
    if (!specCache.has(el)) {
      const cs = getComputedStyle(el);
      const safe = (fn) => {
        try {
          return fn(el, cs);
        } catch (error) {
          console.warn('Ruler: could not read specs', error);
          return [];
        }
      };
      specCache.set(el, {
        component: component(el),
        typography: safe(typographyRows),
        color: safe(colorRows),
        spacing: safe(spacingRows),
        border: safe(borderRows),
        motion: safe(motionRows),
      });
    }
    return specCache.get(el);
  };

  const tokenText = (row) => {
    if (row.display) return row.display;
    if (!row.token) return row.value;
    const token = row.raw ? row.token : `$${row.token}`;
    return row.status === 'match' ? `≈ ${token}` : token;
  };

  const rowHtml = (row) => {
    const dot = row.status ? `<i class="dot ${row.status}"></i>` : '';
    const swatch = row.swatch ? `<i class="swatch" style="background:${esc(row.swatch)}"></i>` : '';
    const detail = [row.token ? row.value : '', row.note].filter(Boolean).join(' · ');
    return (
      `<div class="row"><span>${dot}${esc(row.label)}</span><b>${swatch}${esc(tokenText(row))}</b></div>` +
      (detail ? `<div class="sub">${esc(detail)}</div>` : '')
    );
  };

  const specsHtml = (el) => {
    const info = inspect(el);
    return SPECS.filter((spec) => state.specs.has(spec) && info[spec].length)
      .map((spec) => `<div class="sec">${spec}</div>${info[spec].map(rowHtml).join('')}`)
      .join('');
  };

  // Text that scrolls when it doesn't fit. Panels are redrawn on every
  // pointer move, so each text keeps its own start time and the animation
  // resumes where it was instead of restarting.
  const marquee = (text, className = '') =>
    `<span class="marquee ${className}"><span>${esc(text)}</span></span>`;

  const marqueeStarts = new Map();
  const fitMarquees = (node) => {
    for (const box of node.querySelectorAll('.marquee')) {
      const inner = box.firstElementChild;
      const overflow = inner.scrollWidth - box.clientWidth;
      if (overflow <= 0) continue;
      const text = inner.textContent;
      if (!marqueeStarts.has(text)) {
        if (marqueeStarts.size > 100) marqueeStarts.clear();
        marqueeStarts.set(text, performance.now());
      }
      // About 40px a second, plus the pauses at each end
      const duration = 2500 + overflow * 25;
      const elapsed = (performance.now() - marqueeStarts.get(text)) % (duration * 2);
      inner.style.setProperty('--shift', `${-overflow}px`);
      inner.style.animation = `ruler-marquee ${duration}ms linear ${-elapsed}ms infinite alternate`;
    }
  };

  const elementHtml = (el) => {
    const r = el.getBoundingClientRect();
    const name = inspect(el).component;
    const size = sizeName(el, r);
    return (
      `<div class="title">${marquee(describe(el))}</div>` +
      `<div class="row"><span class="component">${esc(name ?? '')}</span><b>${fmt(r.width)} × ${fmt(r.height)}${
        size ? ` <span class="dim">${size}</span>` : ''
      }</b></div>` +
      specsHtml(el)
    );
  };

  const specsText = (el) => {
    const info = inspect(el);
    const r = el.getBoundingClientRect();
    const size = sizeName(el, r);
    const lines = [describe(el) + (info.component ? ` (${info.component})` : '')];
    lines.push(`Size: ${fmt(r.width)} × ${fmt(r.height)}${size ? ` (${size})` : ''}`);
    for (const spec of SPECS) {
      if (!state.specs.has(spec) || !info[spec].length) continue;
      lines.push('', spec.toUpperCase());
      for (const row of info[spec]) {
        const detail = [row.token ? row.value : '', row.note].filter(Boolean).join(', ');
        lines.push(`${row.label}: ${tokenText(row)}${detail ? ` (${detail})` : ''}`);
      }
    }
    return lines.join('\n');
  };

  // ---------------------------------------------------------------------------
  // Drawing

  // Chrome paints boxes snapped to device pixels. Drawing at the raw
  // fractional rect blurs our edges and leaves them up to half a pixel off, so
  // snap each edge the same way and size from the snapped edges.
  const devicePx = (x) => Math.round(x * devicePixelRatio) / devicePixelRatio;
  const edgesStyle = (left, top, right, bottom) => {
    const [l, t, r, b] = [left, top, right, bottom].map(devicePx);
    return { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` };
  };

  // Boxes carry no labels; the panel names what's hovered or picked
  const drawBox = (rect, color, dashed) => {
    add('box', {
      ...edgesStyle(rect.left, rect.top, rect.right, rect.bottom),
      // Inset, so the box's edges are the element's edges, not 1px outside
      outline: `1px ${dashed ? 'dashed' : 'solid'} ${color}`,
      outlineOffset: '-1px',
      background: `${color}1a`,
    });
  };

  // Margin and padding as filled bands, like the DevTools box model
  const drawSpacing = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const side = (prop) =>
      SIDES.map((s) => parseFloat(cs.getPropertyValue(prop.replace('*', s))) || 0);
    const [mt, mr, mb, ml] = side('margin-*');
    const [bt, br, bb, bl] = side('border-*-width');
    const [pt, pr, pb, pl] = side('padding-*');
    // Computed values are before transforms and CSS zoom; the rect is after.
    // offsetWidth is whole px, so only clear scaling counts.
    const scale = (rect, offset) => {
      const s = offset > 0 ? rect / offset : 1;
      return Math.abs(s - 1) > 0.02 ? s : 1;
    };
    const sx = scale(r.width, el.offsetWidth);
    const sy = scale(r.height, el.offsetHeight);
    // Bands share edges, so neighbours meet exactly with no seam or overlap
    const band = (left, top, right, bottom, value, color) => {
      const width = right - left;
      const height = bottom - top;
      if (value <= 0 || width <= 0 || height <= 0) return;
      const fill = add('fill', { ...edgesStyle(left, top, right, bottom), background: `${color}66` });
      // The band is see-through, so the number sits on a solid badge that
      // reads the same over light and dark elements
      if (Math.min(width, height) >= 12) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.style.background = color;
        badge.textContent = fmt(value);
        fill.append(badge);
      }
    };
    // Edges of the margin, border and padding boxes, outside in
    const margin = { l: r.left - ml * sx, t: r.top - mt * sy, r: r.right + mr * sx, b: r.bottom + mb * sy };
    const pad = { l: r.left + bl * sx, t: r.top + bt * sy, r: r.right - br * sx, b: r.bottom - bb * sy };
    const content = { l: pad.l + pl * sx, t: pad.t + pt * sy, r: pad.r - pr * sx, b: pad.b - pb * sy };
    band(r.left, margin.t, r.right, r.top, mt, COLORS.margin);
    band(r.right, r.top, margin.r, r.bottom, mr, COLORS.margin);
    band(r.left, r.bottom, r.right, margin.b, mb, COLORS.margin);
    band(margin.l, r.top, r.left, r.bottom, ml, COLORS.margin);
    band(pad.l, pad.t, pad.r, content.t, pt, COLORS.padding);
    band(pad.l, content.b, pad.r, pad.b, pb, COLORS.padding);
    band(pad.l, content.t, content.l, content.b, pl, COLORS.padding);
    band(content.r, content.t, pad.r, content.b, pr, COLORS.padding);
  };

  // Horizontal or vertical measurement line with its value in the middle.
  // When the gap is too small for the value, the value goes just outside the
  // measured boxes (`around`) with a faint leader back to the line, so it
  // doesn't cover the elements: above for horizontal lines, right for vertical.
  const drawSpan = (x1, y1, x2, y2, value, around) => {
    if (value <= 0) return;
    const horizontal = y1 === y2;
    add('line', {
      left: `${Math.min(x1, x2)}px`,
      top: `${Math.min(y1, y2)}px`,
      width: horizontal ? `${Math.abs(x2 - x1)}px` : '1px',
      height: horizontal ? '1px' : `${Math.abs(y2 - y1)}px`,
    });
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const tag = add('tag', { left: `${cx}px`, top: `${cy}px`, background: COLORS.line }, fmt(value));
    const { width, height } = tag.getBoundingClientRect();
    const length = Math.abs(horizontal ? x2 - x1 : y2 - y1);
    if (length >= (horizontal ? width : height) + 4) return;

    const gap = 6;
    let tx = cx;
    let ty = cy;
    if (horizontal) {
      ty = around.top - gap - height / 2;
      if (ty - height / 2 < 0) ty = around.bottom + gap + height / 2;
    } else {
      tx = around.right + gap + width / 2;
      if (tx + width / 2 > innerWidth) tx = around.left - gap - width / 2;
    }
    Object.assign(tag.style, { left: `${tx}px`, top: `${ty}px` });
    add('line', {
      left: `${Math.min(cx, tx)}px`,
      top: `${Math.min(cy, ty)}px`,
      width: horizontal ? '1px' : `${Math.abs(tx - cx)}px`,
      height: horizontal ? `${Math.abs(ty - cy)}px` : '1px',
      opacity: '0.4',
    });
  };

  const measure = (ra, rb) => {
    const result = { rows: [] };
    const around = {
      left: Math.min(ra.left, rb.left),
      top: Math.min(ra.top, rb.top),
      right: Math.max(ra.right, rb.right),
      bottom: Math.max(ra.bottom, rb.bottom),
    };
    const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    const midY =
      overlapY > 0
        ? (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2
        : ra.top + ra.height / 2;
    const midX =
      overlapX > 0
        ? (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2
        : ra.left + ra.width / 2;

    if (overlapX <= 0) {
      const [l, r] = ra.right <= rb.left ? [ra, rb] : [rb, ra];
      const gap = r.left - l.right;
      drawSpan(l.right, midY, r.left, midY, gap, around);
      result.rows.push(['Horizontal gap', gap]);
    }
    if (overlapY <= 0) {
      const [t, btm] = ra.bottom <= rb.top ? [ra, rb] : [rb, ra];
      const gap = btm.top - t.bottom;
      drawSpan(midX, t.bottom, midX, btm.top, gap, around);
      result.rows.push(['Vertical gap', gap]);
    }

    // Overlapping on both axes (usually one inside the other): edge insets
    if (overlapX > 0 && overlapY > 0) {
      const inner = ra.width * ra.height <= rb.width * rb.height ? ra : rb;
      const outer = inner === ra ? rb : ra;
      const cy = inner.top + inner.height / 2;
      const cx = inner.left + inner.width / 2;
      const insets = {
        Left: [outer.left, cy, inner.left, cy],
        Right: [inner.right, cy, outer.right, cy],
        Top: [cx, outer.top, cx, inner.top],
        Bottom: [cx, inner.bottom, cx, outer.bottom],
      };
      for (const [name, [x1, y1, x2, y2]] of Object.entries(insets)) {
        const value = x1 === x2 ? y2 - y1 : x2 - x1;
        drawSpan(x1, y1, x2, y2, Math.abs(value), around);
        result.rows.push([`${name} inset`, value]);
      }
    } else {
      // Alignment, useful for checking icons line up
      result.rows.push(['Δ center X', rb.left + rb.width / 2 - (ra.left + ra.width / 2)]);
      result.rows.push(['Δ center Y', rb.top + rb.height / 2 - (ra.top + ra.height / 2)]);
    }
    return result;
  };

  // A spot for a width × height box beside `avoid` (right, left, below, above)
  // so it doesn't cover what's being inspected, or null if none fits
  const besideRect = (width, height, avoid) => {
    const margin = 8;
    const gap = 12;
    const clampX = (x) => Math.max(margin, Math.min(x, innerWidth - margin - width));
    const clampY = (y) => Math.max(margin, Math.min(y, innerHeight - margin - height));
    const spots = [
      [avoid.right + gap, clampY(avoid.top)],
      [avoid.left - gap - width, clampY(avoid.top)],
      [clampX(avoid.left), avoid.bottom + gap],
      [clampX(avoid.left), avoid.top - gap - height],
    ];
    return (
      spots.find(
        ([x, y]) =>
          x >= margin && y >= margin && x + width <= innerWidth - margin && y + height <= innerHeight - margin
      ) ?? null
    );
  };

  // Follows the pointer, flipping to the other side near the viewport edges
  const panel = (html) => {
    if (!html || !state.inside || state.overPin || state.drag) return;
    const node = add('panel', {});
    node.innerHTML = html;
    fitMarquees(node);
    const offset = 16;
    const margin = 8;
    const { x, y } = state.pointer;
    const { width, height } = node.getBoundingClientRect();
    let left = x + offset;
    let top = y + offset;
    if (left + width > innerWidth - margin) left = x - offset - width;
    if (top + height > innerHeight - margin) top = y - offset - height;
    node.style.left = `${Math.max(margin, left)}px`;
    node.style.top = `${Math.max(margin, top)}px`;
  };

  // Carbon 2x grid columns for the current breakpoint
  const drawGrid = () => {
    const viewport = document.documentElement.clientWidth;
    const [name, , columns, margin] = BREAKPOINTS.find(([, min]) => viewport >= min);
    const width = Math.min(viewport, 1584);
    const start = (viewport - width) / 2 + margin;
    const column = (width - margin * 2) / columns;
    for (let i = 0; i < columns; i++) {
      add('col', { left: `${start + i * column + 16}px`, width: `${Math.max(0, column - 32)}px` });
    }
    add('name', { left: `${start}px`, top: '0', transform: 'none', background: COLORS.grid,
      borderRadius: '0 0 3px 3px' }, `${name} · ${columns} col · ${fmt(column)}px`);
  };

  // A or B with its selector; the boxes on the page only carry the letter
  const sizeRow = (el, color, letter) => {
    const r = el.getBoundingClientRect();
    return (
      `<div class="row"><span><span class="swatch" style="background:${color}"></span>${letter}</span>` +
      `${marquee(describe(el), 'title')}<b>${fmt(r.width)} × ${fmt(r.height)}</b></div>`
    );
  };

  const measureRow = ([label, value]) => {
    const token = spacingToken(value);
    return `<div class="row"><span>${label}</span><b>${fmt(value)}px${
      token ? ` <span class="dim">$${token}</span>` : ''
    }</b></div>`;
  };

  // Shortcuts live in the toolbar popup; the panel only says when the page
  // behaves differently than usual
  const frozenNote = () =>
    '<div class="hint">❄ Frozen: the page works normally · F/esc: unfreeze</div>';

  // Pinned cards connect to their element with a dashed line from the
  // nearest points of the two boxes
  const SVG = 'http://www.w3.org/2000/svg';
  const drawWires = () => {
    if (!state.pins.length) return;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'wires');
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (const pin of state.pins) {
      const target = pin.el.getBoundingClientRect();
      const card = pin.card.getBoundingClientRect();
      const cx = card.left + card.width / 2;
      const cy = card.top + card.height / 2;
      const x1 = clamp(cx, target.left, target.right);
      const y1 = clamp(cy, target.top, target.bottom);
      const x2 = clamp(x1, card.left, card.right);
      const y2 = clamp(y1, card.top, card.bottom);
      const line = document.createElementNS(SVG, 'line');
      Object.entries({ x1, y1, x2, y2, stroke: COLORS.pin, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' })
        .forEach(([k, v]) => line.setAttribute(k, v));
      const dot = document.createElementNS(SVG, 'circle');
      Object.entries({ cx: x1, cy: y1, r: 3.5, fill: COLORS.pin }).forEach(([k, v]) =>
        dot.setAttribute(k, v)
      );
      svg.append(line, dot);
    }
    layer.append(svg);
  };

  let frame = 0;
  const render = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      layer.replaceChildren();
      if (!state.enabled) return;
      checkStyles();
      // Panels take the opposite scheme to the area under the pointer so they
      // stand out from it. Over a pinned card, keep the current scheme.
      if (!state.overPin) {
        const probe = state.frozen ?? state.raw ?? state.a ?? state.pinHover?.el;
        host.classList.toggle('light', pageIsDark(probe));
      }
      if (state.grid) drawGrid();

      for (const pin of [...state.pins]) {
        if (!pin.el.isConnected) unpin(pin);
      }
      drawWires();
      if (state.pinHover) {
        drawBox(state.pinHover.el.getBoundingClientRect(), COLORS.pin, false);
        if (state.specs.has('spacing')) drawSpacing(state.pinHover.el);
      }

      // Frozen: one element, its specs re-read every frame so hover, focus
      // and open states show as the page changes
      if (state.frozen) {
        const el = state.frozen;
        if (!el.isConnected) {
          state.frozen = null;
          applyCursor(document);
        } else {
          specCache.delete(el);
          const r = el.getBoundingClientRect();
          if (state.specs.has('spacing')) drawSpacing(el);
          drawBox(r, COLORS.hover, false);
          state.inside = true;
          panel(elementHtml(el) + frozenNote());
          return;
        }
      }

      // With A picked, holding Alt measures to whatever is hovered
      const b = state.b ?? (state.alt && state.a && state.hover !== state.a ? state.hover : null);

      // The hover box is only shown while picking, so it doesn't clutter a
      // finished measurement
      if (!(state.a && b) && state.hover && state.hover !== state.a) {
        const r = state.hover.getBoundingClientRect();
        if (state.specs.has('spacing')) drawSpacing(state.hover);
        drawBox(r, COLORS.hover, true);
      }
      if (state.a?.isConnected) {
        // The panel names A and B; their box colors match its swatches
        drawBox(state.a.getBoundingClientRect(), COLORS.a, false);
      }
      if (b?.isConnected) {
        drawBox(b.getBoundingClientRect(), COLORS.b, false);
      }

      if (state.a && b) {
        const { rows } = measure(state.a.getBoundingClientRect(), b.getBoundingClientRect());
        panel(
          sizeRow(state.a, COLORS.a, 'A') +
            sizeRow(b, COLORS.b, 'B') +
            rows.map(measureRow).join('')
        );
      } else {
        const hovered = state.hover && state.hover !== state.a ? state.hover : null;
        // Only say when A is waiting for B; the popup lists what clicks do
        const prompt = state.a ? '<div class="prompt">Click a second element</div>' : '';
        panel(
          (state.a ? sizeRow(state.a, COLORS.a, 'A') : '') +
            (hovered ? elementHtml(hovered) : '') +
            prompt
        );
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Pinned cards

  const placeCard = (pin) => {
    const { width, height } = pin.card.getBoundingClientRect();
    pin.x = Math.max(0, Math.min(pin.x, innerWidth - width));
    pin.y = Math.max(0, Math.min(pin.y, innerHeight - height));
    pin.card.style.left = `${pin.x}px`;
    pin.card.style.top = `${pin.y}px`;
  };

  const fillCard = (pin) => {
    pin.card.innerHTML =
      `<div class="head"><span class="title">${marquee(describe(pin.el))}</span>` +
      '<button data-act="copy" title="Copy tokens">copy</button>' +
      '<button data-act="close" title="Unpin">×</button></div>' +
      elementHtml(pin.el).replace(/^<div class="title">.*?<\/div>/, '');
    fitMarquees(pin.card);
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API is blocked in some frames and on http pages
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;opacity:0;';
      document.documentElement.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  };

  // Pins are saved per page (each frame has its own URL) as selector paths,
  // one segment per shadow root, and restored when the ruler is turned on
  const pinsKey = () => `rulerPins:${location.href}`;

  const pathTo = (el) => {
    const segments = [];
    for (let node = el; node; ) {
      const scope = node.getRootNode();
      const parts = [];
      for (let n = node; n?.nodeType === Node.ELEMENT_NODE; n = n.parentElement) {
        const id = n.id && `#${CSS.escape(n.id)}`;
        if (id && scope.querySelectorAll(id).length === 1) {
          parts.unshift(id);
          break;
        }
        let nth = 1;
        for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
          if (s.localName === n.localName) nth++;
        }
        parts.unshift(`${CSS.escape(n.localName)}:nth-of-type(${nth})`);
      }
      segments.unshift(parts.join(' > '));
      node = scope instanceof ShadowRoot ? scope.host : null;
    }
    return segments;
  };

  const resolvePath = (segments) => {
    let scope = document;
    let el = null;
    for (const segment of segments) {
      el = scope?.querySelector(segment);
      if (!el) return null;
      scope = el.shadowRoot;
    }
    return el;
  };

  const savePins = () => {
    const pins = state.pins.map((p) => ({ path: pathTo(p.el), x: p.x, y: p.y }));
    const storage = chrome.storage?.local;
    (pins.length ? storage?.set({ [pinsKey()]: pins }) : storage?.remove(pinsKey()))?.catch(() => {});
  };

  const restorePins = () => {
    chrome.storage?.local.get(pinsKey()).then(
      ({ [pinsKey()]: saved }) => {
        if (!state.enabled || !Array.isArray(saved)) return;
        for (const { path, x, y } of saved) {
          const el = resolvePath(path);
          if (el && !state.pins.some((p) => p.el === el)) pin(el, { x, y });
        }
        render();
      },
      () => {}
    );
  };

  const unpin = (pin) => {
    pin.card.remove();
    state.pins = state.pins.filter((p) => p !== pin);
    if (state.pinHover === pin) state.pinHover = null;
    if (state.drag?.pin === pin) state.drag = null;
  };

  const copyAllPins = () =>
    copyText(state.pins.map((p) => specsText(p.el)).join(`\n\n${'-'.repeat(40)}\n\n`));

  const pin = (el, at) => {
    const existing = state.pins.find((p) => p.el === el);
    if (existing) {
      unpin(existing);
      return;
    }
    const card = add('card', {}, null, pinsLayer);
    const entry = { el, card, x: 0, y: 0 };
    fillCard(entry);
    // Restored pins go back where they were; new ones open beside the element
    const { width, height } = card.getBoundingClientRect();
    const spot = besideRect(width, height, el.getBoundingClientRect());
    [entry.x, entry.y] = at ? [at.x, at.y] : spot ?? [state.pointer.x + 24, state.pointer.y + 24];
    placeCard(entry);

    card.addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      if (button?.dataset.act === 'close') {
        unpin(entry);
        savePins();
        render();
      } else if (button?.dataset.act === 'copy') {
        const ok = await copyText(specsText(entry.el));
        button.textContent = ok ? 'copied' : 'failed';
        setTimeout(() => (button.textContent = 'copy'), 1200);
      }
    });
    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button') || !event.target.closest('.head')) return;
      event.preventDefault();
      state.drag = { pin: entry, dx: event.clientX - entry.x, dy: event.clientY - entry.y };
    });
    card.addEventListener('pointerenter', () => {
      state.pinHover = entry;
      render();
    });
    card.addEventListener('pointerleave', () => {
      if (state.pinHover === entry) state.pinHover = null;
      render();
    });
    state.pins.push(entry);
  };

  const clearPins = () => {
    for (const p of [...state.pins]) unpin(p);
  };

  // ---------------------------------------------------------------------------
  // Spec and grid choices, shared by every frame and the toolbar popup
  // through extension storage

  const setSpecs = (specs, save) => {
    state.specs = new Set(specs.filter((s) => SPECS.includes(s)));
    for (const p of state.pins) fillCard(p);
    if (save) chrome.storage?.local.set({ rulerSpecs: [...state.specs] }).catch(() => {});
    render();
  };

  const setGrid = (on, save) => {
    state.grid = on;
    if (save) chrome.storage?.local.set({ rulerGrid: on }).catch(() => {});
    render();
  };

  chrome.storage?.local.get(['rulerSpecs', 'rulerGrid']).then(({ rulerSpecs, rulerGrid }) => {
    if (Array.isArray(rulerSpecs)) setSpecs(rulerSpecs, false);
    setGrid(rulerGrid === true, false);
  }, () => {});
  chrome.storage?.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.rulerSpecs?.newValue) setSpecs(changes.rulerSpecs.newValue, false);
    if (changes.rulerGrid) setGrid(changes.rulerGrid.newValue === true, false);
  });

  // ---------------------------------------------------------------------------
  // Events

  // Crosshair cursor everywhere. A document style can't reach into shadow
  // roots that set their own cursor, so each root the pointer passes through
  // gets a copy too.
  const cursorStyles = new Map();
  const applyCursor = (scope) => {
    if (cursorStyles.has(scope) || scope === root) return;
    const style = document.createElement('style');
    style.textContent =
      '*, *::before, *::after { cursor: crosshair !important; }';
    (scope === document ? document.documentElement : scope).append(style);
    cursorStyles.set(scope, style);
  };
  const removeCursor = () => {
    for (const style of cursorStyles.values()) style.remove();
    cursorStyles.clear();
  };

  // Events on our own cards pass through to them instead of being blocked
  const ours = (event) => event.composedPath().includes(host);

  const deepTarget = (event) => {
    const node = event.composedPath().find((n) => n instanceof Element);
    return node && node !== host ? node : null;
  };

  // Each frame draws its own overlay, so the frame the pointer left hides its
  // hover box and panel instead of leaving them stuck at the last position
  const leave = () => {
    state.inside = false;
    state.raw = state.hover = null;
    state.history = [];
    render();
  };

  // relatedTarget is null when leaving for a parent frame or the window, and
  // the <iframe> element when entering a child frame
  const isFrame = (node) => node?.tagName === 'IFRAME' || node?.tagName === 'FRAME';

  const onOut = (event) => {
    if (!event.relatedTarget || isFrame(event.relatedTarget)) leave();
  };

  const onMove = (event) => {
    state.pointer = { x: event.clientX, y: event.clientY };
    if (state.drag) {
      const { pin: dragged, dx, dy } = state.drag;
      dragged.x = event.clientX - dx;
      dragged.y = event.clientY - dy;
      placeCard(dragged);
      render();
      return;
    }
    state.alt = event.altKey;
    state.overPin = ours(event);
    // Frozen: the panel stays on its element and the page gets the pointer
    if (state.frozen) {
      render();
      return;
    }
    if (state.overPin) {
      state.inside = true;
      state.raw = state.hover = null;
      render();
      return;
    }
    for (const node of event.composedPath()) {
      if (node instanceof ShadowRoot) applyCursor(node);
    }
    const target = deepTarget(event);
    // Over an iframe the pointer belongs to the child frame's ruler
    if (isFrame(target)) {
      leave();
      return;
    }
    state.inside = true;
    if (target !== state.raw) {
      state.raw = target;
      state.hover = target;
      state.history = [];
    }
    render();
  };

  const stop = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const block = (event) => {
    if (!ours(event) && !state.frozen) stop(event);
  };

  const onUp = (event) => {
    if (state.drag) {
      state.drag = null;
      savePins();
    }
    block(event);
  };

  const onClick = (event) => {
    if (ours(event)) return;
    if (state.frozen) {
      // Let the page handle it, then show the state it changed to
      setTimeout(render, 50);
      return;
    }
    stop(event);
    const el = state.hover;
    if (!el) return;
    if (event.shiftKey) {
      pin(el);
      savePins();
      render();
      return;
    }
    // Clicking a picked element deselects it; B moves up to A if A goes
    if (el === state.a) {
      state.a = state.b;
      state.b = null;
    } else if (el === state.b) {
      state.b = null;
    } else if (!state.a) {
      state.a = el;
    } else if (!state.b) {
      state.b = el;
    } else {
      state.a = el;
      state.b = null;
    }
    render();
  };

  // A field focused before the ruler was turned on still gets its letters
  const typing = (event) => {
    const target = event.composedPath()[0];
    return target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);
  };

  const setFrozen = (el) => {
    state.frozen = el;
    // The page's own cursors show while it's usable
    if (el) removeCursor();
    else applyCursor(document);
    render();
  };

  const onKey = (event) => {
    const letter = !event.ctrlKey && !event.metaKey && !event.altKey && !typing(event)
      ? event.key.toLowerCase()
      : null;
    const spec = SPEC_KEYS[letter];

    // Frozen: only unfreezing is ours; every other key goes to the page
    if (state.frozen) {
      if (event.key === 'Escape' || letter === 'f') {
        stop(event);
        setFrozen(null);
      } else {
        setTimeout(render, 50);
      }
      return;
    }

    if (event.key === 'Alt') {
      // Alone, Alt focuses the browser menu on Windows
      stop(event);
      state.alt = true;
      render();
    } else if (event.key === 'Escape') {
      stop(event);
      if (state.a) {
        state.a = state.b = null;
        render();
      } else if (state.pins.length) {
        clearPins();
        savePins();
        render();
      } else {
        chrome.runtime.sendMessage({ type: 'ruler:off' });
      }
    } else if (spec) {
      stop(event);
      const specs = new Set(state.specs);
      if (specs.has(spec)) specs.delete(spec);
      else specs.add(spec);
      setSpecs([...specs], true);
    } else if (letter === 'f' && state.hover) {
      stop(event);
      setFrozen(state.hover);
    } else if (letter === 'g') {
      stop(event);
      setGrid(!state.grid, true);
    } else if (letter === 'a' && state.pins.length) {
      stop(event);
      copyAllPins();
    } else if (event.key === 'ArrowUp' && state.hover) {
      stop(event);
      const parent = parentOf(state.hover);
      if (parent && parent !== document.documentElement) {
        state.history.push(state.hover);
        state.hover = parent;
        render();
      }
    } else if (event.key === 'ArrowDown' && state.history.length) {
      stop(event);
      state.hover = state.history.pop();
      render();
    }
  };

  const onKeyUp = (event) => {
    if (event.key === 'Alt') {
      state.alt = false;
      render();
    }
  };

  const onBlur = () => {
    state.alt = false;
    render();
  };

  const listeners = [
    ['pointermove', onMove],
    ['pointerout', onOut],
    ['click', onClick],
    ['pointerdown', block],
    ['pointerup', onUp],
    ['mousedown', block],
    ['mouseup', block],
    ['dblclick', block],
    ['contextmenu', block],
    ['keydown', onKey],
    ['keyup', onKeyUp],
    ['blur', onBlur],
    ['scroll', render],
    ['resize', render],
    // Frozen elements change state on focus and transitions too
    ['focusin', render],
    ['focusout', render],
    ['transitionend', render],
  ];

  // Our cards' events stop at the overlay, so the page never sees them
  for (const type of ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu']) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }

  const setEnabled = (enabled) => {
    if (enabled === state.enabled) return;
    state.enabled = enabled;
    for (const [type, fn] of listeners) {
      if (enabled) window.addEventListener(type, fn, true);
      else window.removeEventListener(type, fn, true);
    }
    // Stylesheets may have changed since the last run
    ruleIndex = new WeakMap();
    specCache = new WeakMap();
    indexedScopes.clear();
    stylesSignature = '';
    if (enabled) {
      document.documentElement.append(host);
      applyCursor(document);
      restorePins();
    } else {
      removeCursor();
      clearPins();
      Object.assign(state, {
        raw: null,
        hover: null,
        history: [],
        a: null,
        b: null,
        inside: false,
        overPin: false,
        drag: null,
        alt: false,
        frozen: null,
      });
      host.remove();
    }
    render();
  };

  window.__ruler = { setEnabled };
})();
