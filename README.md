# LinkCast — Netlify + Google Cast fix

This package is the web sender app plus the custom receiver page.

## Important setup

Your current Google Cast Application ID is:

- `7A03A2F5`

Your Cast console receiver URL must be:

- `https://stately-cocada-84b9b2.netlify.app/receiver.html`

Do **not** leave the receiver URL as just the root site URL if you want the custom receiver page to launch correctly.

## Why the cast chooser was failing

The earlier web app could miss the Google Cast SDK availability callback because of script loading order.
This fixed build loads the Cast SDK after the callback is registered.

## Unpublished receiver testing

Because your receiver is **Unpublished**, you must:

1. Add your Chromecast / Google TV / Android TV device in the Google Cast Developer Console
2. Wait about 15 minutes
3. Reboot the Cast device
4. Keep the sender device and Cast device on the same Wi‑Fi network

## Supported web sender environments

Best results:

- Chrome on Mac / Windows
- Chrome on Android

Not supported for Google Cast Web Sender:

- iPhone / iPad browsers

## Netlify upload

Upload this zip or folder to Netlify.

Files included:

- `index.html` = sender page
- `receiver.html` = custom Cast receiver page

