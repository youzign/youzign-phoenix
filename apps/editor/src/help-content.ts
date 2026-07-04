export type HelpBlock =
  | { type: "paragraph"; text: string }
  | { type: "tip"; text: string }
  | { type: "shortcut-table"; rows: { keys: string; action: string }[] }
  | { type: "shot-ref"; file: string; caption: string };

export interface HelpSection {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

export const sections: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    blocks: [
      { type: "shot-ref", file: "dashboard.png", caption: "Dashboard, new design flow, sorting, and local design cards." },
      {
        type: "paragraph",
        text: "The dashboard is your local design library. Use the sample design on an empty dashboard, New design to start from a preset, enter a custom canvas size, import a local XML design, or drop an image to create a canvas at the image's prepared size.",
      },
      {
        type: "paragraph",
        text: "Design cards open the editor, duplicate a document, delete it after confirmation, and rename on double-click. The list can be sorted by newest or oldest and paginates when the local library grows.",
      },
      {
        type: "tip",
        text: "Youzign OSS is local-first: designs live in this browser profile through IndexedDB/localStorage until you export or import a backup.",
      },
    ],
  },
  {
    id: "editor-basics",
    title: "Editor Basics",
    blocks: [
      { type: "shot-ref", file: "editor-overview.png", caption: "Editor shell with sidebar, canvas, pages strip, properties, and layers." },
      {
        type: "paragraph",
        text: "Click an item to select it, Shift-click to add or remove it from the selection, drag from empty canvas to marquee-select, and drag selected items to move them. Text selection boxes hug the rendered glyphs. Double-click a group to drill into a child; Escape returns to the parent group or clears selection.",
      },
      {
        type: "paragraph",
        text: "Corner handles resize proportionally by default. Text corners scale the font and text box width together, while text side pills change only the wrap width and let the height reflow. Edge pill handles stretch shapes and other non-image items; on images, edge handles crop inward and can be dragged back out before the crop is committed.",
      },
      {
        type: "paragraph",
        text: "Use the rotate handle to turn selected items. The HUD shows the angle; rotation snaps to 45-degree guides by default, Shift quantizes to 15-degree steps, and Ctrl or Cmd enables fine rotation. Items are visually clipped at the canvas edge while selection handles can remain outside it.",
      },
      {
        type: "paragraph",
        text: "Smart guides snap movement to canvas edges, centers, nearby items, and visible grid lines. Hold Alt or Option during a drag to ignore snapping. Press G to toggle the grid, adjust zoom from the top bar, and use undo/redo for committed edits and gestures.",
      },
    ],
  },
  {
    id: "pages",
    title: "Pages",
    blocks: [
      { type: "shot-ref", file: "pages.png", caption: "Bottom page strip with document pages and page actions." },
      {
        type: "paragraph",
        text: "Multi-page documents use the strip at the bottom of the editor. Add a new page, duplicate the current page, delete pages you no longer need, or drag page thumbnails to reorder them.",
      },
      {
        type: "paragraph",
        text: "PageUp and PageDown move between pages. Undo and redo operate at the whole-document level, so page changes and item edits are part of the same history.",
      },
    ],
  },
  {
    id: "adding-content",
    title: "Adding Content",
    blocks: [
      { type: "shot-ref", file: "panels-photos.png", caption: "Photos, uploads, icons, and element libraries in the left sidebar." },
      {
        type: "paragraph",
        text: "Photos shows Unsplash results with featured content, search, category chips, load more, and insert-to-canvas. My uploads accepts PNG, JPG, WEBP, and SVG files, stores them locally, and canvas drag-drop inserts image files near the cursor.",
      },
      {
        type: "paragraph",
        text: "Icons searches Iconify with Color and Line modes plus category chips. Color icons keep their designed fills; line icons and recolorable clipart can be styled from the properties panel.",
      },
      { type: "shot-ref", file: "panels-text.png", caption: "Text presets, font search, font combinations, and text effect chips." },
      {
        type: "paragraph",
        text: "Text inserts a basic text box, heading/body-style presets, searchable Google font choices, and 14 multi-layer font combinations. Text effect chips map to legacy-safe styles: None, Outline, Neon, Sticker, Hard shadow, and Echo.",
      },
      {
        type: "paragraph",
        text: "Elements inserts parametric shapes, styled shapes, and multi-layer combinations such as ribbons, badges, buttons, and quote cards. Create connects to fal.ai for Generate and Edit: Generate uses a prompt and aspect preset, while Edit accepts a prompt plus up to 10 reference images.",
      },
    ],
  },
  {
    id: "editing-items",
    title: "Editing Items",
    blocks: [
      {
        type: "paragraph",
        text: "The properties panel changes the selected item's size, rotation, opacity, fill, text styling, and image-specific controls. Text and parametric shapes can use a solid fill or no fill.",
      },
      {
        type: "paragraph",
        text: "Effects include shadow, border, blur, blend modes, invert intensity, and image corner radius presets including per-corner values. Text effects use the same legacy attributes where possible.",
      },
      {
        type: "paragraph",
        text: "Arrange controls duplicate, delete, flip, center, bring/send to front or back, and move one layer forward or backward. Lock selected items to keep them selectable while blocking movement, resize, rotation, and deletion for the session.",
      },
      {
        type: "paragraph",
        text: "The Layers panel lists top-level items, supports selection, session lock toggles, and drag reorder. It does not serialize locks because the legacy XML format has no locked-item field.",
      },
    ],
  },
  {
    id: "brand-kit",
    title: "Brand Kit",
    blocks: [
      { type: "shot-ref", file: "brand-kit.png", caption: "Brand tab with brands, palette, fonts, and saved assets." },
      {
        type: "paragraph",
        text: "A brand stores reusable colors, heading and body fonts, and logo or image assets. The Brand tab can start a brand from the current design's colors, create a blank brand, rename or delete brands, and switch which brand is active.",
      },
      {
        type: "paragraph",
        text: "Palette controls add, remove, reorder, and edit brand colors. The active brand's colors appear at the top of every color popover so fills, borders, shadows, backgrounds, and other color controls can reuse them with one click.",
      },
      {
        type: "paragraph",
        text: "Heading and body font choices are pinned as Brand fonts at the top of the font picker, and any Google Font can be added by name from the picker. Brand uploads accept PNG, JPG, WEBP, and SVG files, store them locally, and insert them onto the canvas from the Brand tab.",
      },
      {
        type: "paragraph",
        text: "Brand prompts save up to two short reusable style notes and appear as chips in the Create tab so active-brand language can be appended to image prompts.",
      },
      {
        type: "paragraph",
        text: "You can keep multiple brands in the browser, with one active at a time. Backup export and import carries brands and their brand assets so the Brand Kit round-trips with local designs.",
      },
    ],
  },
  {
    id: "ai-tools",
    title: "A.I. Tools",
    blocks: [
      { type: "shot-ref", file: "ai-tools.png", caption: "Image magic tools and fal.ai-powered actions." },
      { type: "shot-ref", file: "remove-bg.png", caption: "Local Remove bg applied to a portrait cutout on the canvas." },
      {
        type: "paragraph",
        text: "Remove bg is free and runs on your device with the bundled U2-Netp ONNX model. It replaces the selected image source with a PNG cutout without sending the image to fal.ai.",
      },
      {
        type: "paragraph",
        text: "Blur is also free and on-device. It builds a local subject cutout, shows a live background-blur preview, and bakes the result only when you apply it.",
      },
      {
        type: "paragraph",
        text: "Eraser needs a fal.ai key from Connect fal.ai. Brush over the part of an image you want removed; fal.ai fills the masked area and the image source is replaced with the result.",
      },
      {
        type: "paragraph",
        text: "Edit needs a fal.ai key. Brush a mask on an image, enter a replacement prompt, and the selected area is inpainted into the same image source.",
      },
      {
        type: "paragraph",
        text: "Grab needs a fal.ai key. Click a subject to segment it, extract it into a new layer, and fill the hole left behind in the original image.",
      },
      {
        type: "paragraph",
        text: "Expand needs a fal.ai key. Pick a ratio chip, preview the outpainted direction, then use Apply to replace the source with the larger centered image and clear crop memory.",
      },
      {
        type: "paragraph",
        text: "Upscale needs a fal.ai key. It sends a capped image source to the upscaler, replaces it with a higher-resolution source, and keeps the canvas width and height unchanged.",
      },
      {
        type: "tip",
        text: "The Create tab uses Google nano-banana 2 lite for text-to-image. fal.ai keys are stored in browser localStorage for this app and are never serialized into design XML or backup files.",
      },
    ],
  },
  {
    id: "background-canvas",
    title: "Background & Canvas",
    blocks: [
      { type: "shot-ref", file: "backgrounds.png", caption: "Canvas background controls for solid color, gradients, transparency, and border." },
      {
        type: "paragraph",
        text: "When nothing is selected, the properties panel edits the canvas background. Use solid color, legacy gradient presets with editable mode/angle/stops, transparent canvas, and border width/color.",
      },
      { type: "shot-ref", file: "resize.png", caption: "Resize menu with presets, custom dimensions, and smart resize." },
      {
        type: "paragraph",
        text: "Resize offers modern presets and custom width/height. The smart-resize toggle scales existing content uniformly and recenters it instead of cropping the design.",
      },
    ],
  },
  {
    id: "saving-exporting",
    title: "Saving & Exporting",
    blocks: [
      { type: "shot-ref", file: "export.png", caption: "Export menu for image, PDF, transparency, scale, and page options." },
      {
        type: "paragraph",
        text: "Autosave persists committed document changes locally. The top bar can import or export XML designstrings for the active design.",
      },
      {
        type: "paragraph",
        text: "Export supports PNG, JPG, and PDF. PNG and JPG can render at 1-5x scale; PNG can preserve transparency. Multi-page documents export sequential PNG/JPG files or a PDF with one page per canvas, with page ranges available from the export menu.",
      },
    ],
  },
  {
    id: "backup-portability",
    title: "Backup & Portability",
    blocks: [
      { type: "shot-ref", file: "backup.png", caption: "Backup tab for local export and import." },
      {
        type: "paragraph",
        text: "The Backup tab exports every local design, brand, and brand asset into a JSON bundle and imports either a Youzign backup bundle or a single XML design. This is the portability path for the local-first OSS app.",
      },
      {
        type: "paragraph",
        text: "A youzign.com archive import is planned for the restored legacy archive. Until that archive is available, use local backups to move designs between browsers or machines.",
      },
    ],
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    blocks: [
      {
        type: "shortcut-table",
        rows: [
          { keys: "⌘/Ctrl + Z", action: "Undo" },
          { keys: "⇧⌘/Ctrl + Z", action: "Redo" },
          { keys: "⌘/Ctrl + Y", action: "Redo" },
          { keys: "⌘/Ctrl + D", action: "Duplicate selection" },
          { keys: "⌘/Ctrl + B", action: "Toggle bold on selected text" },
          { keys: "⌘/Ctrl + I", action: "Toggle italic on selected text" },
          { keys: "⌘/Ctrl + U", action: "Toggle underline on selected text" },
          { keys: "Delete / Backspace", action: "Delete selected unlocked items" },
          { keys: "Arrow keys", action: "Nudge selection by 1 px" },
          { keys: "Shift + Arrow keys", action: "Nudge selection by 10 px" },
          { keys: "Escape", action: "Exit group drill selection, cancel selection state, or clear selection" },
          { keys: "G", action: "Toggle grid overlay" },
          { keys: "PageUp / PageDown", action: "Go to previous or next page" },
          { keys: "Enter in text edit", action: "Commit inline text editing" },
          { keys: "Click away in text edit", action: "Commit inline text editing and continue the click" },
          { keys: "Shift + Enter in text edit", action: "Insert a line break" },
          { keys: "Escape in text edit", action: "Cancel text editing and restore previous content" },
        ],
      },
    ],
  },
];
