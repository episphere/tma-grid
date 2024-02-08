import imagebox3 from "https://episphere.github.io/imagebox3/imagebox3.mjs"

export const getWSIInfo = async (imageURL) => {
  return await (await imagebox3.getImageInfo(imageURL)).json()
}

export const getPNGFromWSI = async (imageURL, maxDimension) => {
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
  
  const imageTile = await imagebox3.getImageTile(imageURL, tileParams, true)
  return imageTile

}