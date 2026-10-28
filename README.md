# Ruler

A Chrome extension that measures the space between two elements on a page and
shows the Carbon v11 tokens (type, color, spacing, border, motion) an element
uses. It reaches into open shadow roots (web components) and runs in every
frame, so it works inside Storybook's preview iframe.

## Install

From the Chrome Web Store (link once it's published), or:

1. Download `ruler.zip` from the [latest release](https://github.com/devadula-nandan/ruler/releases/latest) and unzip it, or clone this repo
2. Open `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked** and pick the `ruler` folder

After changing the code, reload the extension **and** the page: a tab keeps
running the copy of the ruler it already had.

The ruler has no access to any page until you turn it on there (Chrome's
`activeTab`), and it makes no network requests. See the
[privacy policy](PRIVACY.md).

## Use

1. Click the Ruler toolbar icon and **Turn on for this tab**, or press
   `Alt+Shift+M`. The badge shows `ON`. The popup also has the spec and grid
   switches and lists every shortcut, so the panel stays small.
2. Hover an element to see its tag, class, size and Carbon tokens.
3. Click to pick element **A**, then click to pick element **B**.
4. Read the result on the page and in the panel next to the pointer. The
   panel follows the pointer and flips sides near the edges of the window. Its
   colors contrast with the area under the pointer.

Shortcuts (also listed in the popup):

| Key         | Action                                                       |
| ----------- | ------------------------------------------------------------ |
| click       | Pick A, then B. A third click starts over with a new A.      |
| click A/B   | Deselect it. If A is deselected, B becomes A.                |
| hold Alt    | With A picked, measure from A to whatever you hover          |
| shift+click | Pin a token card for the element (again to unpin)            |
| A           | Copy every pinned card's specs as one report                 |
| T C S B M   | Show or hide typography, color, spacing, border, motion      |
| F           | Freeze: lock the panel on the hovered element and let the page work (see below) |
| G           | Show or hide the Carbon 2x grid for the current breakpoint   |
| ArrowUp     | Move the hovered pick to its parent, crossing shadow roots   |
| ArrowDown   | Go back to the child you came from                           |
| Esc         | Clear the picks, then the pinned cards, then turn off        |

The blue hover box hides once A and B are both picked, so it doesn't cover the
measurement. Click again to start over, or press Esc to clear.

Clicks are swallowed while the ruler is on, so picking an element doesn't open
or close it.

### Freeze: inspecting hover, focus and open states

Press **F** over an element to freeze the panel on it. The page then works
normally: hover the element, tab into it, or click it to open a menu, and the
panel re-reads its specs live, so you see the focus ring, hover color or open
state. Press **F** or **Esc** to unfreeze.

### What it measures

- **Side by side or stacked:** the edge-to-edge gap, plus the difference
  between the centers to check alignment.
- **One inside the other** (or overlapping): the left, right, top and bottom
  insets from the inner box to the outer one.

Values are CSS pixels from `getBoundingClientRect()`, so they're right at any
browser zoom level. Only Storybook's own canvas zoom (other than 100%) changes
them.

### Carbon tokens

Each value gets a dot:

- **Green `$token`:** the CSS uses `var(--cds-…)` for it (directly or inherited).
- **Yellow `≈ $token`:** a hard-coded value that equals a token's value.
- **Red:** no token has this value.

Colors are matched against the `--cds-*` custom properties in scope at the
element, so the active theme (white, g10, g90, g100, or a zone) is respected.
Logical properties (`padding-inline`, `border-block-end`, …) count, and the
index of stylesheets refreshes on its own when Storybook or CSS-in-JS adds
styles, so switching stories doesn't need a restart.

- **Typography:** type token, size/line-height/weight/tracking, family.
- **Color:** text and background (transparent backgrounds report the first
  ancestor that paints one), WCAG **contrast** for elements with text (AA, AAA,
  large text), and opacity.
- **Spacing:** padding, margin and flex/grid gaps, drawn as bands on the page
  (margin yellow, padding green). Measured gaps that match the spacing scale
  show their token too.
- **Border:** border color and width, radius, focus outline and box-shadow.
  Radius is matched against the Carbon v12 radius scale (`$border-radius-00`,
  `-02`, `-04`, `-08`, `-16`, `-24`, and `$border-radius-max` for pills).
- **Motion:** transition durations (`$duration-*`) and easings (standard,
  entrance, exit; productive or expressive), and animations.
- **Size:** the header shows Carbon control sizes (`size md` for a 40px tall
  control) and icon sizes (`icon 16`), also when hovering an icon's `<path>`.

Pinned cards open beside their element, can be dragged by their header, are
linked to the element by a dashed line, and have a **copy** button. Pins are
saved per page and come back the next time you turn the ruler on there, even
after a reload. The spec keys apply to every frame and are remembered.

### Tips

- Hovering an icon usually lands on its `<path>`. Press ArrowUp once to get
  the `<svg>` (the 16px icon box) or twice to get its button.
- Arrow keys go to the frame that has focus. In Storybook, if they don't
  respond, open the story on its own (`iframe.html?id=...`).
- Both picks must be in the same frame.
- Frames from another site than the page (cross-origin iframes) aren't
  covered by `activeTab`, so the ruler doesn't run in them. Storybook's
  preview iframe is on the same site, so it works.
- Click the icon again to turn the ruler off. Reload the page if it gets stuck.

## Releasing

In GitHub, open **Actions → chrome-web-store-publish → Run workflow**, pick
`patch`, `minor` or `major`, and run it. The workflow bumps `version` in
`manifest.json`, uploads the zip to the Chrome Web Store and submits it for
review. Once the upload works, it pushes a `Release x.y.z` commit and a
`vx.y.z` tag, and makes a GitHub release with `ruler.zip` attached. If the
upload fails (for example while the last version is still in review),
nothing is pushed.

From the terminal: `gh workflow run chrome-web-store-publish -f bump=patch`.

Pushing a `v*` tag yourself also publishes, without bumping, so bump
`version` first (for example to `1.3.1`).
