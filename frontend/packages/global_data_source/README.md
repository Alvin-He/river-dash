# Global Data Table

This is the shared data source and data manager for RiverDash.

# Usage

Add the following to your `package.json`:

```
	"@river-dash/global-data-source": "^1.0.0"
```

then run `npm install`

# Compilation

run `npm run build` to compile all files into "./dist".

You **MUST** compile before attempting to import this package. Otherwise
the import will just not work.

# Documentation

To compile documentation, run: `npm run doc`.

Then open "./docs/index.html" in a browser.

Note: Opening the docs on a http server might break links. So stick to opening
it directly as a file in a browser. It works better than way for some reason.
