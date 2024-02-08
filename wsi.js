let image = {}

export const getWSIInfo = async (imageURL) => {
  const { default: imagebox3 } = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
  return await (await imagebox3.getImageInfo(imageURL)).json()
}

export const getPNGFromWSI = async (imageURL, maxDimension) => {
  const { default: imagebox3 } = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
  const { width, height } = await (await imagebox3.getImageInfo(imageURL)).json()
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
  const { default: imagebox3 } = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
  
  const imageTile = await imagebox3.getImageTile(imageURL, tileParams, true)
  return imageTile

}