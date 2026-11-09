# Branding assets

The webconsole uses the SVG selected by `BRAND_MARK_SRC` in
[`src/config/branding.ts`](../../src/config/branding.ts).

The current asset is
`public/branding/Single-Tone Logo (SPT Orange).svg`. To change the logo,
add or replace an SVG in this folder and update `BRAND_MARK_SRC` to its public
URL (for example, `/branding/your-logo.svg`). The header and sign-in page
use the same configured asset.

SVG images retain their aspect ratio through `object-fit: contain`. The
browser-tab favicon is configured separately in `public/favicon.svg`.
