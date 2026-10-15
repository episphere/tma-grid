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

## Citation

If you use TMA-Grid in your work, please cite the manuscript:

Ge A, Saha M, Duggan MA, et al. TMA-Grid: an open-source, zero-footprint web application for FAIR tissue microarray de-arraying. *BMC Bioinformatics*. 2026. doi:10.1186/s12859-026-06638-2

## Issues

Report bugs and request features at https://github.com/episphere/tma-grid/issues

## License

See [LICENSE](LICENSE).
