# LinkCast Netlify diagnostics build

This version has:
- Cast App ID hardcoded to `7A03A2F5`
- diagnostics panel for Chrome testing
- root URL sender + receiver support

## Best test method
1. Upload this ZIP to Netlify.
2. Open the site in desktop Chrome.
3. Make sure the TV and laptop are on the same Wi-Fi.
4. Watch the Diagnostics panel.
5. If Cast state stays `NO_DEVICES_AVAILABLE`, recheck the Google Cast software serial registration on the TV.

## Important
For Android TV / Google TV devices, use the TV's **Google Cast software serial number**, not the generic hardware/status serial number.
