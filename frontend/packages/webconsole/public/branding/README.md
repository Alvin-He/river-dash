# River Dash brand SVG placeholder

To add the real logo:

1. Replace `frontend/packages/webconsole/public/branding/brand-mark.svg` with your SVG file, keeping that filename.
2. Refresh the login page or dashboard. Both use the same asset. No code change is needed.

If you prefer a different SVG filename, update `BRAND_MARK_SRC` in
`frontend/packages/webconsole/src/config/branding.ts` to `/branding/your-filename.svg`.

The header reserves an 18 x 18 px logo area (`ConsoleHeader.module.css`) and
login reserves a 39 x 39 px area (`LoginPage.module.css`). The image uses
`object-fit: contain` so it retains its aspect ratio. CSS adds no background
or orange square around the logo. If your own SVG includes a background, that
will still be visible.

The browser-tab favicon (`public/favicon.svg`) is unchanged by this update.
