import imagebox3 from "./imagebox3.js"

export const getWSIInfo = async (imageURL) => {
  console.log('imageURL', imageURL)
  debugger
  return await (await imagebox3.getImageInfo(imageURL)).json()
}


export const getPNGFromWSI = async (imageURL, maxDimension) => {
  const { width, height } = await (await imagebox3.getImageInfo(imageURL)).json()
  const scalingFactor = Math.min(
    1024 / width,
    1024 / height
  );
  // Store the scaling factor
  window.scalingFactor = scalingFactor;

  debugger
      // Store the scaling factor
  let thumbnailWidthToRender, thumbnailHeightToRender
  if (width >= height) {
    thumbnailWidthToRender = maxDimension
  } else {
    thumbnailHeightToRender = maxDimension
  }
  const imageThumbnail = await imagebox3.getImageThumbnail(imageURL, {
    thumbnailWidthToRender,
    thumbnailHeightToRender
  }, true)
  return imageThumbnail
}

export const getRegionFromWSI = async (imageURL, tileParams) => {
  
  const imageTile = await imagebox3.getImageTile(imageURL, tileParams, true)
  return imageTile

}