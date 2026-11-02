// Visitor analytics events (shared by the client tracker, the collect API and /admin/analytics).
// Labels are English: /admin/analytics is the admin's own page (her choice, 2026-11-02).
export const ANALYTICS_EVENT_LABELS: Record<string, string> = {
  app_open: "Visited the site",
  place_preview: "Tapped a map pin",
  place_opened: "Opened a place",
  search: "Searched",
  category_selected: "Picked a category",
  filter_changed: "Used a filter",
  call: "Call",
  whatsapp: "WhatsApp",
  website: "Website",
  navigate: "Navigate",
  share: "Share",
  save: "Saved to favorites",
  reviews_seen: "Read the reviews",
  review_start: "Started a review",
  review_submitted: "Sent a review",
  helpful: "\"Helped me\"",
  contact_reviewer: "Contacted a reviewer",
  report: "Reported a mistake",
  owner_claim: "\"Is this your business?\"",
  add_place_open: "Add a place",
  sign_in_click: "Clicked sign in",
  signed_in: "Signed in",
  intro_video: "Watched the video",
  legend_open: "Icon legend",
  edit_attrs_open: "Edit details",
  location_change_open: "Fix location",
  sort_open: "Sort",
};

export const ANALYTICS_EVENTS = new Set(Object.keys(ANALYTICS_EVENT_LABELS));
