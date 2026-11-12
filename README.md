# TDM Testimonials

TDM Testimonials is a lightweight WordPress plugin for managing testimonials and displaying them in an accessible, responsive, continuously scrolling carousel.

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

- `limit`: `0` displays all testimonials; otherwise accepts `1`–`100`.
- `order`: `DESC` (newest first) or `ASC` by review date.
- `rows`: `1` or `2`.
- `speed`: `0` disables autoplay; values from `0`–`2` control movement speed.

Invalid values fall back to the defaults. Automatic movement is disabled when the visitor requests reduced motion.

## Accessibility and interaction

- Hover or keyboard focus pauses a row temporarily.
- Left and right arrow keys scroll the focused row.
- Pointer and touch dragging are supported.
- Loop duplicates are hidden from assistive technology.
- Uploaded avatars are decorative because the reviewer name is printed beside them.

## Development

Front-end CSS and JavaScript are enqueued only when the shortcode produces testimonial output. The carousel has no third-party runtime dependencies.
