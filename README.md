# LinkCast Netlify package

This package is ready to upload directly to Netlify.

## Important

Use this package for Netlify:
- `index.html` is at the root
- `receiver.html` is at the root
- `_redirects` and `netlify.toml` are included

## Upload to Netlify

1. Open Netlify.
2. Choose **Add new site** -> **Deploy manually**.
3. Drag **linkcast-netlify.zip** into Netlify.
4. Open the generated site URL.

## Notes

- If you upload the old `linkcast-native.zip`, Netlify will show a 404 because that file is native Android/iPhone source code, not a website.
- The web app will open correctly from this package.
- Real Cast device selection from a website still depends on a Cast-supported browser, HTTPS, and a valid Google Cast receiver app ID.
