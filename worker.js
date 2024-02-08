import { getRegionFromWSI } from "./wsi.js";

// worker.js
self.onmessage = async function(e) {
  const { svsImageURL, core, coreSize } = e.data;
  // Assuming getRegionFromWSI is available or imported in the worker context
  const tileParams = {
    tileX: core.x - core.currentRadius,
    tileY: core.y - core.currentRadius,
    tileWidth: core.currentRadius * 2,
    tileHeight: core.currentRadius * 2,
    tileSize: coreSize,
  };

  try {
    const imageResp = await getRegionFromWSI(svsImageURL, tileParams, 1);
    // Process the image response, create an object URL, etc.
    const objectURL = URL.createObjectURL(await imageResp.blob());
    self.postMessage({ status: 'success', objectURL: objectURL, coreId: core.id });
  } catch (error) {
    self.postMessage({ status: 'error', error: error, coreId: core.id });
  }
};
