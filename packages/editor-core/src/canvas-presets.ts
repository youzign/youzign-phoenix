// Modernized canvas-size preset catalog (2026 platform specs).
//
// Descended from the legacy `editor/assets/xml/setting.xml` (~70 entries) but
// rebuilt for today: dead platforms dropped (Google+, StockUnlimited-era sizes,
// Mockzign/Comp-Card/Teespring one-offs), every dimension updated to the current
// published spec, and the flat menu regrouped into five browsable categories.
// Pure data — no S3 image_url dependency, unit-testable.

export type PresetCategory = "Social" | "Video" | "Print" | "Web";

export interface CanvasPreset {
  id: string;
  name: string;
  /** short platform/context label for the group chip */
  group: string;
  width: number;
  height: number;
  category: PresetCategory;
  /** target dpi (print = 300, everything screen = 72) */
  dpi: number;
}

const SCREEN = 72;
const PRINT = 300;

export const CANVAS_PRESETS: CanvasPreset[] = [
  // ---- Social ----
  { id: "ig-post-portrait", name: "Instagram Post", group: "Instagram", width: 1080, height: 1350, category: "Social", dpi: SCREEN },
  { id: "ig-post-square", name: "Instagram Square", group: "Instagram", width: 1080, height: 1080, category: "Social", dpi: SCREEN },
  { id: "ig-story", name: "Instagram Story / Reel", group: "Instagram", width: 1080, height: 1920, category: "Social", dpi: SCREEN },
  { id: "fb-post", name: "Facebook Post", group: "Facebook", width: 1200, height: 630, category: "Social", dpi: SCREEN },
  { id: "fb-cover", name: "Facebook Cover", group: "Facebook", width: 851, height: 315, category: "Social", dpi: SCREEN },
  { id: "fb-story", name: "Facebook Story", group: "Facebook", width: 1080, height: 1920, category: "Social", dpi: SCREEN },
  { id: "x-post", name: "X Post", group: "X", width: 1600, height: 900, category: "Social", dpi: SCREEN },
  { id: "x-header", name: "X Header", group: "X", width: 1500, height: 500, category: "Social", dpi: SCREEN },
  { id: "li-post", name: "LinkedIn Post", group: "LinkedIn", width: 1200, height: 627, category: "Social", dpi: SCREEN },
  { id: "li-cover", name: "LinkedIn Cover", group: "LinkedIn", width: 1584, height: 396, category: "Social", dpi: SCREEN },
  { id: "pin", name: "Pinterest Pin", group: "Pinterest", width: 1000, height: 1500, category: "Social", dpi: SCREEN },
  { id: "tiktok", name: "TikTok Video", group: "TikTok", width: 1080, height: 1920, category: "Social", dpi: SCREEN },
  { id: "threads-post", name: "Threads Post", group: "Threads", width: 1080, height: 1350, category: "Social", dpi: SCREEN },

  // ---- Video ----
  { id: "yt-thumbnail", name: "YouTube Thumbnail", group: "YouTube", width: 1280, height: 720, category: "Video", dpi: SCREEN },
  { id: "yt-channel-art", name: "YouTube Channel Art", group: "YouTube", width: 2560, height: 1440, category: "Video", dpi: SCREEN },
  { id: "video-vertical", name: "Vertical Video", group: "Reels", width: 1080, height: 1920, category: "Video", dpi: SCREEN },
  { id: "video-hd", name: "HD 720p", group: "Video", width: 1280, height: 720, category: "Video", dpi: SCREEN },
  { id: "video-fhd", name: "Full HD 1080p", group: "Video", width: 1920, height: 1080, category: "Video", dpi: SCREEN },
  { id: "video-2k", name: "2K QHD", group: "Video", width: 2560, height: 1440, category: "Video", dpi: SCREEN },
  { id: "video-4k", name: "4K UHD", group: "Video", width: 3840, height: 2160, category: "Video", dpi: SCREEN },

  // ---- Print (px @ 300 dpi) ----
  { id: "print-a4", name: "A4", group: "Paper", width: 2480, height: 3508, category: "Print", dpi: PRINT },
  { id: "print-a5", name: "A5 Flyer", group: "Paper", width: 1748, height: 2480, category: "Print", dpi: PRINT },
  { id: "print-a3", name: "A3 Poster", group: "Paper", width: 3508, height: 4961, category: "Print", dpi: PRINT },
  { id: "print-letter", name: "US Letter", group: "Paper", width: 2550, height: 3300, category: "Print", dpi: PRINT },
  { id: "print-business-card", name: "Business Card", group: "Cards", width: 1050, height: 600, category: "Print", dpi: PRINT },
  { id: "print-postcard", name: "Postcard", group: "Cards", width: 1875, height: 1275, category: "Print", dpi: PRINT },
  { id: "print-greeting-card", name: "Greeting Card", group: "Cards", width: 1500, height: 2100, category: "Print", dpi: PRINT },

  // ---- Web ----
  { id: "web-leaderboard", name: "Leaderboard", group: "Ads", width: 728, height: 90, category: "Web", dpi: SCREEN },
  { id: "web-medium-rectangle", name: "Medium Rectangle", group: "Ads", width: 300, height: 250, category: "Web", dpi: SCREEN },
  { id: "web-large-rectangle", name: "Large Rectangle", group: "Ads", width: 336, height: 280, category: "Web", dpi: SCREEN },
  { id: "web-half-page", name: "Half Page", group: "Ads", width: 300, height: 600, category: "Web", dpi: SCREEN },
  { id: "web-wide-skyscraper", name: "Wide Skyscraper", group: "Ads", width: 160, height: 600, category: "Web", dpi: SCREEN },
  { id: "web-billboard", name: "Billboard", group: "Ads", width: 970, height: 250, category: "Web", dpi: SCREEN },
  { id: "web-email-header", name: "Email Header", group: "Web", width: 600, height: 200, category: "Web", dpi: SCREEN },
  { id: "web-blog-banner", name: "Blog Banner", group: "Web", width: 1200, height: 630, category: "Web", dpi: SCREEN },
  { id: "web-favicon", name: "Favicon", group: "Web", width: 512, height: 512, category: "Web", dpi: SCREEN },
  { id: "web-wallpaper", name: "Desktop Wallpaper", group: "Web", width: 1920, height: 1080, category: "Web", dpi: SCREEN },
];

export const PRESET_CATEGORIES: PresetCategory[] = ["Social", "Video", "Print", "Web"];

/** Clamp bounds for custom W×H entry (shared by UI + validation). */
export const CANVAS_MIN = 32;
export const CANVAS_MAX = 8000;

export function clampCanvasDim(n: number): number {
  if (!Number.isFinite(n)) return CANVAS_MIN;
  return Math.max(CANVAS_MIN, Math.min(CANVAS_MAX, Math.round(n)));
}
