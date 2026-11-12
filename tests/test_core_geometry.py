"""Known-geometry regressions through the actual browser postprocessing pipeline.

The probability tensors are controlled incomplete-mask fixtures. These tests
measure geometry refinement, not neural-network accuracy or clinical validity.
"""
import math
import json
import os
from pathlib import Path
import unittest
from playwright.sync_api import sync_playwright


class CoreGeometry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(channel=os.getenv("TMA_BROWSER_CHANNEL", "msedge"), headless=True)
        cls.page = cls.browser.new_page()
        cls.page.goto(os.getenv("TMA_BASE_URL", "http://127.0.0.1:8000"), wait_until="networkidle", timeout=90000)
        cls.page.wait_for_function("window.cv && typeof cv.getBuildInformation === 'function'", timeout=90000)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def detect(self, circles, *, pale=False, damaged=False):
        return self.page.evaluate("""async ({circles,pale,damaged}) => {
          const tf = await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/+esm');
          const detector = await import('/javascript/core_detection.js');
          const canvas = document.createElement('canvas');
          canvas.width = 1024; canvas.height = 512;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#f5f5f5'; ctx.fillRect(0,0,1024,512);
          for (const core of circles) {
            ctx.fillStyle = pale ? '#e1d0e1' : '#a24ca2';
            ctx.beginPath(); ctx.arc(core.x,core.y,core.radius,0,Math.PI*2);ctx.fill();
            if (damaged) {
              ctx.fillStyle='#f5f5f5';
              if (damaged === 'split') ctx.fillRect(core.x-3,core.y-core.radius-2,6,core.radius*2+4);
              else {
                ctx.fillRect(core.x,core.y,core.radius+2,core.radius+2);
                ctx.beginPath();ctx.arc(core.x-4,core.y-4,4,0,Math.PI*2);ctx.fill();
              }
            }
          }
          const mask = document.createElement('canvas');mask.width=512;mask.height=512;
          const m=mask.getContext('2d');
          for (const core of circles) {
            m.fillStyle='white';m.beginPath();
            m.arc((core.x+6)/2,(core.y+4)/2,core.radius*0.66/2,0,Math.PI*2);m.fill();
          }
          const bytes=m.getImageData(0,0,512,512).data;
          const probabilities=new Float32Array(512*512);
          for(let i=0;i<probabilities.length;i++) probabilities[i]=bytes[i*4]/255;
          window.neuralNetworkResult?.dispose();
          window.neuralNetworkResult=tf.tensor4d(probabilities,[1,512,512,1]);
          window.segmentationGeometry={trainingWidth:1024,trainingHeight:1024,modelWidth:512,modelHeight:512,imageWidth:1024,imageHeight:512};
          const image=new Image();image.src=canvas.toDataURL();await image.decode();
          const start=performance.now();
          const [properties]=await detector.runSegmentationAndObtainCoreProperties(image,null,0.5,80,20000,0.6);
          return {properties,elapsed:performance.now()-start,diagnostics:window.coreDetectionDiagnostics};
        }""", {"circles":circles,"pale":pale,"damaged":damaged})

    def assert_geometry(self, circles, **options):
        result = self.detect(circles, **options)
        properties = result["properties"]
        errors = []
        for truth in circles:
            closest = min(properties, key=lambda p: math.hypot(p["x"]-truth["x"],p["y"]-truth["y"])) if properties else None
            if closest:
                errors.append({"center":math.hypot(closest["x"]-truth["x"],closest["y"]-truth["y"]),"radius":abs(closest["radius"]-truth["radius"])})
        destination = os.getenv("TMA_GEOMETRY_EVIDENCE")
        if destination:
            folder = Path(destination)
            folder.mkdir(parents=True,exist_ok=True)
            (folder/f"{self._testMethodName}.json").write_text(json.dumps({"truth":circles,"result":result,"errors":errors},indent=2),encoding="utf-8")
        self.assertEqual(len(properties), len(circles), result)
        used = set()
        for truth in circles:
            index = min(range(len(properties)), key=lambda i: math.hypot(properties[i]["x"]-truth["x"], properties[i]["y"]-truth["y"]))
            self.assertNotIn(index, used, "Two cores share one detected circle")
            used.add(index)
            actual = properties[index]
            error = math.hypot(actual["x"]-truth["x"],actual["y"]-truth["y"])
            self.assertLessEqual(error,2.0,f"Center error {error:.2f}px: {actual}, expected {truth}")
            self.assertLessEqual(abs(actual["radius"]-truth["radius"]),2.0,f"Radius error: {actual}, expected {truth}")
        self.assertLess(result["elapsed"],5000,"Geometry postprocessing must remain interactive")

    def test_incomplete_shifted_mask_uses_the_original_image_boundary(self):
        self.assert_geometry([{"x":128+column*128,"y":160,"radius":20} for column in range(5)])

    def test_individual_radii_are_preserved(self):
        self.assert_geometry([{"x":128+i*140,"y":180,"radius":radius} for i,radius in enumerate([16,22,28,18,25])])

    def test_partial_tissue_and_internal_holes(self):
        self.assert_geometry([{"x":160+i*140,"y":220,"radius":22} for i in range(4)], damaged=True)

    def test_split_tissue_fragments_do_not_become_smaller_cores(self):
        self.assert_geometry([{"x":160+i*140,"y":220,"radius":22} for i in range(4)], damaged="split")

    def test_blank_original_image_retains_the_existing_estimate(self):
        result = self.page.evaluate("""async () => {
          const {refineCoreGeometry}=await import('/javascript/core_geometry.js');
          const canvas=document.createElement('canvas');canvas.width=400;canvas.height=240;
          canvas.getContext('2d').fillStyle='white';canvas.getContext('2d').fillRect(0,0,400,240);
          const core={x:180,y:120,radius:20,area:Math.PI*400,annotations:'Retain this estimate'};
          return refineCoreGeometry(canvas,[core]);
        }""")
        self.assertEqual(result["properties"][0]["x"],180)
        self.assertEqual(result["properties"][0]["y"],120)
        self.assertEqual(result["properties"][0]["radius"],20)
        self.assertEqual(result["diagnostics"]["fitted"],0)
        self.assertEqual(result["diagnostics"]["retained"],1)

    def test_real_sample_does_not_fit_large_circles_between_neighbors(self):
        page = self.page
        page.get_by_role("button",name="Load Sample",exact=True).click()
        page.wait_for_function("Boolean(window.loadedImg)",timeout=90000)
        page.locator("#upload .btn-proceed").click()
        page.wait_for_function("window.properties?.length>100 && document.getElementById('segmentationApplyStatus').textContent.includes('updated')",timeout=90000)
        properties=page.evaluate("window.properties")
        # Visual engineering references on the public 1024x734 preview, with
        # about 2px annotation uncertainty. These are not clinical annotations.
        references=[(280,155,18),(364,155,18),(406,155,18),(446,155,18),
                    (690,154,18),(730,154,18),(774,280,18),(490,408,18)]
        for x,y,radius in references:
            core=min(properties,key=lambda c:math.hypot(c['x']-x,c['y']-y))
            # 2px reference uncertainty plus the 2px fitting budget. The exact
            # synthetic geometry tests above keep their stricter 2px limit.
            self.assertLessEqual(math.hypot(core['x']-x,core['y']-y),4.0,f"Incorrect center near {(x,y)}: {core}")
            self.assertLessEqual(abs(core['radius']-radius),4.0,f"Incorrect radius near {(x,y)}: {core}")

    def test_low_contrast_tissue(self):
        self.assert_geometry([{"x":160+i*140,"y":220,"radius":22} for i in range(4)], pale=True)

    def test_nearby_cores_keep_distinct_centers(self):
        self.assert_geometry([{"x":256,"y":220,"radius":20},{"x":298,"y":220,"radius":20},{"x":450,"y":220,"radius":20}])


if __name__ == "__main__":
    unittest.main()
