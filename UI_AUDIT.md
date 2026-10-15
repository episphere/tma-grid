# TMA-Grid UI audit, 2026-10-14

Scope: `index.html`, `style2.css`, and `README.md` at the live site
(https://episphere.github.io/tma-grid/). Every item below was checked against
the shipped markup and styles. JavaScript behavior, element ids, and the
classes the scripts hook into were not changed.

## Fixed in this pass

### Broken and missing links
1. **Manuscript link was dead.** Both the desktop and mobile navigation used
   `href="#"`, so clicking Manuscript only jumped to the top of the page.
   Both now link to the published article:
   https://link.springer.com/article/10.1186/s12859-026-06638-2
   (BMC Bioinformatics, published September 9, 2026, verified live).
2. **No favicon, no meta description, no social preview tags.** Browsers
   showed a generic tab icon and search engines had no summary. Added a
   description, theme color, the logo as favicon, and Open Graph tags.
3. **External links behaved inconsistently.** GitHub, Issues, and Tutorial
   opened in the same tab and took the user out of a work session. All
   external links now open in a new tab with `rel="noopener noreferrer"`,
   and the polish CSS marks them with an arrow.
4. **Footer had no links and a stale date.** It read "© 2024 Tissue
   Microarray De-Arraying Tool" and linked nowhere. It now names TMA-Grid,
   sets the year from the visitor's clock, and links the manuscript,
   GitHub, and the tutorial.

### Invalid HTML that browsers silently mis-handle
5. **Duplicate `id="file-icon"`** on the two file-info icons. Ids must be
   unique; the metadata icon is now `id="metadata-file-icon"`, and both
   decorative icons have empty alt text instead of repeating "File icon".
6. **Duplicate `class` attributes** on the Core Radius and Image Rotation
   sliders (`class="mt-2 mb-2"` and later `class="w-full"` on the same tag).
   Browsers keep only the first attribute, so `w-full` never applied.
   Merged into one class attribute per slider.
7. **`alt` attribute on a `<canvas>`** (ignored by browsers) and
   **`type="text"` on a `<textarea>`** (not a valid attribute). Removed;
   the canvas now carries `role="img"` and an aria-label.
8. **Empty `onclick=""`** on the Use Template button. Removed, and the
   button now declares `type="button"`.
9. **Fake placeholder data in the page:** the hidden file-info panel shipped
   with the literal text "screenshot.png" and "(2MB)". Both spans now start
   empty and are filled only when a file is chosen.

### Accessibility
10. **No `<h1>` on the page.** The brand title was a `<span>`. It is now the
    h1, with CSS that keeps its exact appearance.
11. **Icon-only buttons had no accessible name.** Seven "Dismiss
    instructions" buttons and five close/remove buttons were a bare × or ✕
    to a screen reader. Each now has an aria-label that names its panel.
12. **Keyboard focus was invisible on many controls** that set
    `focus:outline-none` in markup. The polish CSS adds a `:focus-visible`
    ring for links, buttons, inputs, selects, textareas, and summaries.
13. **Reduced motion was ignored.** A `prefers-reduced-motion` rule now
    shortens transitions and animations for users who request it.

### Inconsistent styling
14. **Back buttons were red** (Tailwind red utilities in the markup plus a
    `#be3a3a` rule late in the stylesheet). Red reads as a destructive
    action; Back is plain navigation. Back is now a neutral white button
    with a gray border; the one red that stays is the Misaligned cores
    legend dot, which is a data color, not a control.
15. **Primary buttons came in at least four blues and three greens**
    (blue-500, blue-600, blue-700 hovers, `#3c8fe7`, green-500, green-600,
    `#3fd677`). The polish layer at the end of `style2.css` sets one
    primary blue (`#1d4ed8`), one success green (`#15803d`), one 8px
    radius, and one font weight for Apply, Proceed, Export Grid, Box,
    Load URL, and the metadata downloads.
16. **Body font declared a font that was never loaded.** The stylesheet
    sets `'Inter', sans-serif` but no page loaded Inter, so every visitor
    saw a fallback font. Inter is now loaded from Google Fonts.
17. **Heading sizes drifted.** Gridding instruction panels used `text-lg`
    while the upload, segmentation, and export panels used `text-xl` for
    the same component. All instruction headings are now `text-xl`, with a
    matching rule in the polish layer.
18. **Duplicate padding utilities** on the Metadata JSON/CSV buttons
    (`px-6 py-2` and `px-4 py-2` on the same element; the later class in
    the stylesheet won at random). Removed the second pair.
19. **Legend labels ended in periods** ("Marker cores.") while every other
    label in the app does not. Periods removed.
20. **A leftover template comment** ("Add more buttons if you have more
    steps") shipped in the production markup. Removed.

### Copy
21. **Doubled word:** "hyperparameters such as as the image's rotation".
    Fixed to "such as the image's rotation".
22. **Doubled word in a tooltip:** "Distance after the the core with the
    greatest X value". Fixed.
23. **Typo in a tooltip:** "the entire gird" for "the entire grid". Fixed.
24. **Redundant phrasing:** "click the Proceed button to proceed to ..."
    appeared twice. Both now read "to continue to ...".
25. **Heading wording:** "Utilizing the virtual grid" is now "Using the
    Virtual Grid", which matches the other headings and reads plainly.

### Data mismatch
26. **Virtual-grid spacing controls disagreed with themselves.** The
    Horizontal and Vertical Spacing sliders shipped with `value="100"`
    while their readouts next to them said `50`, and the reset code in
    `javascript/UI.js` also uses 50. The sliders now start at 50, matching
    their readouts. (The fieldset holding them is currently hidden; the
    mismatch would surface the moment it is shown.)

### README
27. **The README was two lines** with no citation, no instructions, and no
    description. It now states what the app does, the four workflow steps,
    how to run it locally, the full manuscript citation with DOI, and
    where to file issues.

## Noted, not changed in this pass

- `javascript/main_old.js` (1,368 lines) is not loaded by `index.html` or
  any other file. It reads as a superseded version of `main2.js`. Left in
  place so this change stays reviewable; deleting it should be its own
  commit after a maintainer confirms nothing external loads it.
- The Tailwind CDN stylesheet is version 2.1.2 (2021). Upgrading Tailwind
  changes utility generation across the whole page and needs its own pass
  with visual checks per panel.
- `style2.css` carries 55 `!important` rules and several sections that
  restyle the same components two or three times (the header alone is
  defined three times). The polish layer works within that structure;
  consolidating the stylesheet is a larger refactor that should not ride
  along with a link and polish fix.
- The upload panel defaults to the Image URL tab with a demo image URL
  prefilled. That looks deliberate (it powers the Load Sample flow), so
  the default was left alone.
- Ten `console.log` calls remain across the JavaScript files. They do not
  affect the interface; removing them belongs with a JavaScript cleanup,
  not a UI pass.
