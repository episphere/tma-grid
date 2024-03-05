import { getPNGFromWSI } from "./wsi.js";

document.getElementById('convertBtn').addEventListener('click', async () => {


    // Reset the result image
    document.getElementById('resultImg').src = '';


    let imageURL = document.getElementById('imageURL').value;

    console.log('imageURL:', imageURL);
    try {
      const imageThumbnail = await getPNGFromWSI(imageURL, 1024);
      const resultImg = document.getElementById('resultImg');

      let objectURL = URL.createObjectURL(await imageThumbnail.blob());

      resultImg.crossOrigin = "anonymous";
      resultImg.src = objectURL;


        // Download the image
        const a = document.createElement('a');
        a.href = objectURL;
        a.download = 'thumbnail.png';
        a.click();


    } catch (error) {
      console.error('Error converting the image:', error);
      alert('Failed to convert the image. Please check the console for more details.');
    }
  });