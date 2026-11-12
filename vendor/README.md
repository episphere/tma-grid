# Reused scientific viewer controls

`tissuumaps/HTMLElementUtils.js` is copied byte for byte from TissUUmaps 3 at commit `d541bbcba7e218851c1e838bc1610e8b1ec753a9`, file `tissuumaps/static/js/utils/HTMLElementUtils.js`. Author: Leslie Solorzano and TissUUmaps contributors. MIT license: `tissuumaps/LICENSE`. No changes were made to the source file. TMA-Grid's separate host adapter is `javascript/workspace.js` and uses the original factory to construct the gridding toolbar.

Source: https://github.com/TissUUmaps/TissUUmaps3/blob/d541bbcba7e218851c1e838bc1610e8b1ec753a9/tissuumaps/static/js/utils/HTMLElementUtils.js

OpenSeadragon 4.1.0 remains loaded from the application's existing CDN URL in `index.html`. Its complete native button, toolbar, zoom, home and full-page controllers execute directly. The host only supplies custom button IDs. Its BSD-3-Clause license is retained in `openseadragon/LICENSE.txt`.

Source: https://github.com/openseadragon/openseadragon/tree/v4.1.0

`lucide/book-open.svg` and `lucide/circle-help.svg` are the original complete SVG files from Lucide 0.468.0, the same icon family used by the inspected TissUUmaps toolbar. No modifications were made. The authors' ISC/Feather MIT notices are retained in `lucide/LICENSE`. These are static header icons, with no package runtime.

Source: https://github.com/lucide-icons/lucide/tree/0.468.0/icons

Selection, unchanged-baseline evidence and adaptations: `docs/design/workspace-redesign/REUSE-AUDIT.md`.

The repository attributes preserve vendored bytes and line endings. Whitespace checks are disabled only for the unchanged TissUUmaps factory, which contains upstream trailing whitespace.
