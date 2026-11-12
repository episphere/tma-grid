/* Host adapter. The DOM factory is unmodified TissUUmaps source; navigation
 * and zoom behavior remain owned by TMA-Grid and OpenSeadragon respectively. */
(() => {
  const factory = window.HTMLElementUtils;
  const toolbar = factory.createElement({
    kind: "div", id: "gridViewerToolbar",
    extraAttributes: { class: "image-toolbar", "aria-label": "Slide viewer tools" },
  });
  const editing = factory.createElement({
    kind: "div", id: "gridEditTools", extraAttributes: { class: "image-edit-tools" },
  });
  const navigation = factory.createElement({
    kind: "div", extraAttributes: { class: "image-navigation-tools", role: "group", "aria-label": "Image navigation" },
  });
  for (const [id, text, label] of [
    ["gridZoomOut", "−", "Zoom out"],
    ["gridZoomIn", "+", "Zoom in"],
    ["gridFit", "Fit slide", "Fit slide"],
    ["gridFullScreen", "Full screen", "Full screen"],
  ]) {
    navigation.append(factory.createButton({
      id, innerText: text, class: "viewer-tool-button",
      extraAttributes: { type: "button", "aria-label": label, title: label },
    }));
  }
  toolbar.append(editing, navigation);
  document.querySelector(".viewer-panel").prepend(toolbar);
})();
