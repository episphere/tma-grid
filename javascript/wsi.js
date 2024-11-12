import Imagebox3 from "https://cdn.jsdelivr.net/gh/episphere/imagebox3/imagebox3.mjs"

let imagebox3Instance;
const numWorkers = Math.max(window.navigator.hardwareConcurrency/2, 1)

const createImagebox3Instance = async (imageSource) => {
  if (!imagebox3Instance?.getImageSource()) {
    imagebox3Instance = new Imagebox3(imageSource, numWorkers)
    await imagebox3Instance.init()
  }
  else if (imagebox3Instance?.getImageSource() !== imageSource) {
    await imagebox3Instance.changeImageSource(imageSource)
  }
}

export const getWSIInfo = async (imageURL) => {
  await createImagebox3Instance(imageURL)
  return await imagebox3Instance.getInfo()
}

export const getPNGFromWSI = async (imageURL, maxDimension) => {
  await createImagebox3Instance(imageURL)
  
  const { width, height } = await getWSIInfo(imageURL)
  const scalingFactor = Math.min(
    1024 / width,
    1024 / height
  );
  // Store the scaling factor
  window.scalingFactor = scalingFactor;

  // Store the scaling factor
  let thumbnailWidthToRender, thumbnailHeightToRender
  if (width >= height) {
    thumbnailWidthToRender = maxDimension
  } else {
    thumbnailHeightToRender = maxDimension
  }
  
  const imageThumbnail = await imagebox3Instance.getThumbnail(thumbnailWidthToRender, thumbnailHeightToRender)
  return imageThumbnail
}

export const getRegionFromWSI = async (imageURL, tileParams) => {
  await createImagebox3Instance(imageURL)
  const { tileX, tileY, tileWidth, tileHeight, tileSize } = tileParams
  const imageTile = await imagebox3Instance.getTile( tileX, tileY, tileWidth, tileHeight, tileSize )
  return imageTile

}