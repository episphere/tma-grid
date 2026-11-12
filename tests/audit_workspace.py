"""Capture Nielsen evidence and run axe-core 4.14.0 against real workflow states.

Run manually against the local server; not part of unittest discovery.
The pinned testing engine is injected in this browser only, never the app.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

out = Path('docs/design/workspace-redesign/nielsen-evidence')
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1568,'height':1003}, record_video_dir=str(out))
    page = context.new_page()
    dialogs = []
    def respond(dialog):
        dialogs.append(dialog.message)
        if "Discard unsaved" in dialog.message: dialog.dismiss()
        else: dialog.accept()
    page.on('dialog', respond)
    page.goto('http://127.0.0.1:8000', wait_until='networkidle')
    page.add_script_tag(url='https://cdn.jsdelivr.net/npm/axe-core@4.14.0/axe.min.js')
    results = {}
    def audit(name):
        result = page.evaluate("""async () => {
          const result = await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
          return {version:result.testEngine.version,violations:result.violations,incomplete:result.incomplete.map(i=>({id:i.id,nodes:i.nodes.map(n=>n.target)})),passes:result.passes.length};
        }""")
        results[name] = result
        (out/'accessibility.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
        print(name, [(v['id'],len(v['nodes'])) for v in result['violations']], flush=True)
    audit('open-local')
    page.get_by_role('tab',name='Image URL',exact=True).click(); audit('open-url')
    page.get_by_role('tab',name='Box',exact=True).click(); audit('open-box')
    page.get_by_role('tab',name='Local file',exact=True).click()
    page.get_by_role('button', name='Help', exact=True).click()
    page.keyboard.press('Escape')
    print('Help visible after Escape:', page.locator('#upload .instructions-container').is_visible(), flush=True)
    page.screenshot(path=str(out/'help-escape-after.png'))
    if page.locator('#upload .instructions-container').is_visible(): page.locator('#upload .close-instructions').click()
    page.get_by_role('button', name='Load Sample', exact=True).click()
    page.wait_for_function('Boolean(window.loadedImg)', timeout=90000)
    page.locator('#upload .btn-proceed').click()
    page.wait_for_function('window.properties?.length > 0', timeout=90000)
    print('Undo disabled initially:', page.locator('#segmentationUndoButton').is_disabled(), 'Redo:', page.locator('#segmentationRedoButton').is_disabled(), flush=True)
    page.screenshot(path=str(out/'history-after.png'))
    audit('segment')
    page.locator('#finalizeSegmentation').click()
    page.wait_for_function('window.sortedCoresData?.length > 0 && window.viewer?.world?.getItemCount() > 0', timeout=90000)
    page.locator('.core-overlay-for-gridding:not(.marker)').first.dblclick()
    audit('core-editor')
    page.keyboard.press('Escape')
    print('Core editor visible after Escape:', page.locator('#editSidebar').is_visible(), flush=True)
    page.screenshot(path=str(out/'editor-escape-after.png'))
    if page.locator('#editSidebar').is_visible(): page.locator('#closeEditCoreButton').click()
    audit('grid')
    print('Review buttons:', page.locator('#gridding').get_by_role('button').all_text_contents(), flush=True)
    page.locator('#create-virtual-grid').click()
    page.wait_for_function("document.getElementById('virtualGridStatus').hidden", timeout=180000)
    audit('export')
    previews = page.locator('#VirtualGridSVSContainer .image-container:not(.image-container-missing)')
    previews.first.click()
    print('Metadata fields:', page.locator('#editMetadataForm input').evaluate_all('es=>es.map(e=>[e.name,e.value])'), flush=True)
    field = page.locator('#editMetadataForm input[name=annotations]')
    field.fill('Uncommitted audit edit')
    page.screenshot(path=str(out/'metadata-edit-after.png'))
    previews.nth(1).click()
    previews.first.click()
    print('Unsaved edit after switching core:', field.input_value(), flush=True)
    page.get_by_role('button', name='Update Metadata', exact=True).click()
    print('Visible save feedback:', page.locator('#virtual-grid').inner_text()[-1400:], flush=True)
    page.screenshot(path=str(out/'metadata-after.png'))
    audit('export-selected')
    (out/'dialogs.json').write_text(json.dumps(dialogs,indent=2),encoding='utf-8')
    video = page.video
    context.close()
    video.save_as(str(out/'nielsen-after.webm'))
    browser.close()
