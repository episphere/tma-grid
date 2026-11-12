# TMA-Grid

TMA-Grid is a free, open-source, zero-footprint web application for tissue microarray (TMA) de-arraying. It segments cores in a whole-slide image, builds the virtual grid, lets you edit core metadata, and exports individual cores, all in the browser. No image is uploaded to a server.

**Live app:** https://episphere.github.io/tma-grid/

**Manuscript:** Ge A, Saha M, Duggan MA, et al. TMA-Grid: an open-source, zero-footprint web application for FAIR tissue microarray de-arraying. *BMC Bioinformatics*. 2026. https://link.springer.com/article/10.1186/s12859-026-06638-2

**Video tutorial:** https://youtu.be/miajqyw4BVk

## What it does

1. **Upload** a whole-slide image (`.svs`, `.tif`/`.tiff`, or `.ndpi` recommended; `.png` and `.jpg` work with limited virtual gridding), load the demo image, open an image URL, or connect Box.
2. **Segment** the cores. Tune the preset, mask alpha, sensitivity, and core area limits, then add or remove cores by clicking the image.
3. **Grid** the cores. Adjust the core radius and image rotation, drag cores into place, double-click a core to edit its metadata, and use the review queue to work through flagged cores.
4. **Export** from the virtual grid. Double-click a core to export it at full resolution (`.svs` only), export the whole grid, and download the metadata as JSON or CSV.

## Running locally

The app is static HTML, CSS, and JavaScript. Serve the repository root with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/ in a browser.

The workspace has four stages: Open image, Segment cores, Review grid, and Export. The generated screen targets and matching application captures are available in [the screen comparison](docs/design/workspace-redesign/comparison.html). [Source provenance](docs/design/workspace-redesign/REUSE-AUDIT.md) and [validation details](docs/design/workspace-redesign/VALIDATION.md) and the [Nielsen usability audit](docs/design/workspace-redesign/NIELSEN-AUDIT.md) accompany the redesign.

For browser regression checks, install `requirements-dev.txt`, keep the local server running, and run:

```sh
python -m unittest discover -s tests -v
```

The tests use Microsoft Edge on Windows and load the public Hamamatsu demo over the network. Set `TMA_BASE_URL` for a different local server or `TMA_BROWSER_CHANNEL` for another installed Playwright Chromium channel. Set `TMA_EVIDENCE_DIR` to save screenshots from the browser journeys.

## Citation

If you use TMA-Grid in your work, please cite the manuscript:

Ge A, Saha M, Duggan MA, et al. TMA-Grid: an open-source, zero-footprint web application for FAIR tissue microarray de-arraying. *BMC Bioinformatics*. 2026. doi:10.1186/s12859-026-06638-2

## Issues

Report bugs and request features at https://github.com/episphere/tma-grid/issues

## License

See [LICENSE](LICENSE).
