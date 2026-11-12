# TDM Testimonials

TDM Testimonials is a lightweight WordPress plugin for managing testimonials and displaying them in an accessible, responsive, continuously scrolling carousel.

Current version: **1.1.1**

## Requirements

- WordPress 6.4 or newer
- PHP 7.4 or newer

## Installation

1. Copy this folder to `wp-content/plugins/tdm-testimonials`.
2. Activate **TDM Testimonials** in WordPress.
3. Add published testimonials under **Testimonials** in wp-admin.
4. Insert `[tdm_testimonials]` in an Elementor Shortcode widget, the block editor, or any shortcode-enabled content area.

## Testimonial fields

- Title: reviewer name
- Editor: testimonial text
- Avatar: optional Media Library image
- Rating: required value from 1 to 5
- Review date: required date used for sorting and relative date display

Incomplete published testimonials are excluded from public output.

## Shortcode

```text
[tdm_testimonials limit="0" order="DESC" rows="2" speed="0.25"]
```

- `limit`: `0` displays all testimonials; otherwise accepts `1`-`100`.
- `order`: `DESC` (newest first) or `ASC` by review date.
- `rows`: `1` or `2`.
- `speed`: `0` disables autoplay; values from `0`-`2` control movement speed.

Invalid values fall back to the defaults. Automatic movement is disabled when the visitor requests reduced motion.

## Accessibility and interaction

- Hover or keyboard focus pauses a row temporarily.
- Left and right arrow keys scroll the focused row.
- Pointer and touch dragging are supported.
- Loop duplicates are hidden from assistive technology.
- Uploaded avatars are decorative because the reviewer name is printed beside them.

## Development

Front-end CSS and JavaScript are enqueued only when the shortcode produces testimonial output. The carousel has no third-party runtime dependencies.

## Updates and releases

Installed copies check the latest public release in
`christian01dev-shopify/testimonial-carousel`. WordPress offers **Update now**
when the release is newer and contains an asset named exactly
`tdm-testimonials.zip`. Release checks are cached for up to 12 hours; use
**Dashboard > Updates > Check again** to request a fresh WordPress update check.

To publish a version:

1. Keep the plugin header version and `TDM_TESTIMONIALS_VERSION` synchronized.
2. Commit and push the release changes to `main`.
3. Create and push a matching semantic tag such as `v1.1.1`.
4. The release workflow validates the versions, builds a portable ZIP rooted at
   `tdm-testimonials/`, and publishes it as a GitHub Release asset.

Normal commits do not trigger WordPress update notices; only published GitHub
Releases with the required ZIP asset are considered.

### 1.1.1

- Fixed low-speed marquee movement in browsers that round `scrollLeft` writes.
- Prevented LiteSpeed Cache from combining, deferring, or delaying the carousel runtime.
