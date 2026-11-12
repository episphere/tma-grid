/* Original-image geometry adapter for the existing OpenCV 4.9.0 runtime.
 * Native contour-envelope and Hough-gradient implementations fit circles. See
 * docs/validation/core-geometry-2026-11-12/REUSE-AUDIT.md for provenance,
 * baseline comparisons and validation limits.
 */
function medianRadius(circles, fallback) {
  const values = circles.map(circle => circle.radius).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length ? (values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) : fallback;
}
function getImageContourCircles(source, gray, cores, typicalRadius, fallbackRadius) {
  const rgb = new cv.Mat(), hsv = new cv.Mat(), channels = new cv.MatVector();
  const mask = new cv.Mat(), dark = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
  let saturation;
  try {
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    cv.split(hsv, channels);
    saturation = channels.get(1);
    cv.threshold(saturation, mask, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    cv.threshold(gray, dark, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    cv.bitwise_or(mask, dark, mask);
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour);
        if (area < Math.PI * typicalRadius ** 2 * 0.1) continue;
        const circle = cv.minEnclosingCircle(contour);
        const bounds = cv.boundingRect(contour);
        const fill = area / (Math.PI * circle.radius ** 2);
        // A merged component must not replace several cores with one envelope.
        const contained = cores.filter(core => core.x >= bounds.x && core.y >= bounds.y &&
          core.x <= bounds.x + bounds.width && core.y <= bounds.y + bounds.height).length;
        if (contained > 1 || fill < 0.45 || circle.radius > typicalRadius * 2) continue;
        candidates.push({ x: circle.center.x, y: circle.center.y, radius: circle.radius + 0.5,
          fill, kind: 0, method: "original-image-contour-circle" });
      } finally { contour.delete(); }
    }
    const imageRadius = medianRadius(candidates.filter(circle => circle.fill >= 0.7), fallbackRadius);
    return {
      radius: imageRadius,
      circles: candidates.filter(circle => circle.fill >= 0.7 ||
        (circle.radius >= imageRadius * 0.8 && circle.radius <= imageRadius * 1.2)),
    };
  } finally {
    saturation?.delete(); rgb.delete(); hsv.delete(); channels.delete(); mask.delete(); dark.delete(); contours.delete(); hierarchy.delete();
  }
}
function associateImageCircles(values, componentCircles, cores, width, height, imageRadius) {
  const proposals = [...componentCircles];
  for (let i = 0; i + 2 < values.length; i += 3) {
    proposals.push({ x: values[i], y: values[i + 1], radius: values[i + 2],
      kind: 1, method: "original-image-hough-gradient" });
  }
  const candidates = [];
  for (const circle of proposals) {
    if (!Number.isFinite(circle.radius) || circle.radius <= 0 ||
        circle.x < 0 || circle.y < 0 || circle.x >= width || circle.y >= height) continue;
    let owner = -1;
    let closest = Infinity;
    cores.forEach((core, index) => {
      const distance = Math.hypot(circle.x - core.x, circle.y - core.y);
      if (distance < closest) { closest = distance; owner = index; }
    });
    candidates.push({ ...circle, owner, distance: closest });
  }
  return cores.map((core, index) => {
    let best;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      if (candidate.owner !== index || candidate.distance > core.radius * 0.9 ||
          candidate.radius < core.radius * 0.5 || candidate.radius > core.radius * 1.8) continue;
      // Low-evidence Hough fits cannot grow into neighboring cores. Intact
      // contour fits retain their individual sizes, including larger cores.
      if (candidate.kind === 1 && (candidate.radius > imageRadius * 1.25 || candidate.radius < imageRadius * 0.7)) continue;
      const score = candidate.kind * 10 + (candidate.distance / core.radius) ** 2 + 0.08 * Math.log(candidate.radius / core.radius) ** 2;
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    if (!best) return core;
    return {
      ...core, x: best.x, y: best.y, radius: best.radius,
      area: Math.PI * best.radius * best.radius,
      circleAdjusted: true,
      circleAdjustmentMethod: best.method,
    };
  });
}
function refineCoreGeometry(imageElement, properties) {
  const start = performance.now();
  const diagnostics = { method: "opencv-original-image", attempted: properties.length, fitted: 0, retained: 0 };
  let source, gray, normalized, blurred, circles;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;
    if (!canvas.width || !canvas.height || !properties.length) return { properties, diagnostics };
    canvas.getContext("2d").drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    source = cv.imread(canvas);
    gray = new cv.Mat(); normalized = new cv.Mat(); blurred = new cv.Mat(); circles = new cv.Mat();
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    const range = cv.minMaxLoc(gray);
    if (range.maxVal - range.minVal < 4) {
      diagnostics.retained = properties.length;
      return { properties, diagnostics };
    }
    const typicalRadius = medianRadius(properties, 1);
    cv.normalize(gray, normalized, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
    cv.GaussianBlur(normalized, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    // Joint native selection keeps overlapping neighborhoods from fitting
    // fictitious large circles between neighboring cores. Each fit has one owner.
    cv.HoughCircles(
      blurred, circles, cv.HOUGH_GRADIENT, 1,
      Math.max(6, typicalRadius * 1.25),
      100, Math.max(10, Math.round(typicalRadius)),
      Math.max(3, Math.floor(typicalRadius * 0.55)),
      Math.max(4, Math.ceil(typicalRadius * 1.65))
    );
    const houghValues = Array.from(circles.data32F);
    const houghSizes = [];
    for (let i = 2; i < houghValues.length; i += 3) houghSizes.push({ radius: houghValues[i] });
    const components = getImageContourCircles(source, gray, properties, typicalRadius, medianRadius(houghSizes, typicalRadius));
    const refined = associateImageCircles(houghValues, components.circles, properties, gray.cols, gray.rows, components.radius);
    diagnostics.candidates = houghValues.length / 3 + components.circles.length;
    diagnostics.fitted = refined.filter((core, index) => core !== properties[index]).length;
    diagnostics.retained = properties.length - diagnostics.fitted;
    diagnostics.contourFitted = refined.filter(core => core.circleAdjustmentMethod === "original-image-contour-circle").length;
    return { properties: refined, diagnostics };
  } catch (error) {
    console.warn("Original-image circle fitting unavailable; retaining mask geometry.", error);
    diagnostics.fitted = 0; diagnostics.retained = properties.length;
    diagnostics.error = error?.message || String(error);
    return { properties, diagnostics };
  } finally {
    source?.delete(); gray?.delete(); normalized?.delete(); blurred?.delete(); circles?.delete();
    diagnostics.elapsedMs = Math.round(performance.now() - start);
  }
}
export { refineCoreGeometry };
