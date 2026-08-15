# Atlas v0.4.0

Atlas is a local-first, mobile-first student planner built with plain HTML, CSS, and vanilla JavaScript ES modules.

Version 0.4 adds optional Supabase authentication and conflict-safe cloud syncing alongside Atlas's offline-first local storage. Signed-in devices check the cloud whenever Atlas opens, refreshes, reconnects, or returns to the foreground, and local planner changes are uploaded automatically after a short debounce.

Atlas stores a common snapshot behind every successful sync and uses deterministic three-way merging to distinguish local-only changes, remote-only changes, compatible edits, and true same-record conflicts. Fresh devices can safely adopt an existing cloud copy; unfamiliar or conflicting copies still require review instead of being silently overwritten.

Cloud sync includes private PDF restoration with path and SHA-256 validation, a local recovery snapshot, atomic planner-data application, and a final remote revision check before resolved data is written. Manual Sync now remains available as an explicit status check and recovery control.

Version 0.4.0 also upgrades schedule importing with pasted images, crop and rotation controls, automatic geometry and lighting correction, table-aware OCR passes, field confidence warnings, local correction learning, and opt-in AI repair limited to uncertain fields. The mobile task editor time picker now remains visible outside its dialog bounds.

Version 0.3.6 refines mobile motion without sacrificing the corrected responsive layout. Class cards now use a FLIP transition so surrounding sections move smoothly without animated-height reflow or scroll-anchor bounce. Mobile page navigation restores Atlas's three-strip wipe as a short, fixed-viewport, transform-only animation with reduced-motion support.

## Import a schedule image

Open **Import** in the bottom navigation and choose a clear PNG, JPG, WebP, or camera photo of a tabular class schedule. Atlas uses Tesseract.js in the browser to read the image, converts recognized rows to the normal Atlas schedule structure, and requires a review before saving.

- The default private scan keeps the image and recognized text in the browser.
- The first scan requires internet access to download the OCR engine and English recognition data; Atlas caches that runtime for later offline scans.
- Imported schedules are saved to `localStorage` under `atlas.schedule` and take priority over `data/defaultSchedule.json` on that device.
- Multi-day codes such as `TF`, `MWF`, and `TTH` become separate class entries for each day.
- Use **Restore default JSON schedule** from the Import view to remove the saved import.

OCR is an assisted import, not an authority. Always verify the review screen, particularly `S`/`5`, room codes, AM/PM, and multi-day abbreviations.

### Optional Atlas AI scan

If the private scan cannot identify enough rows, Atlas offers an optional AI scan. Choosing it sends the schedule image and any available on-device OCR transcript to the Atlas Cloudflare Worker for processing. The worker prefers the supplied transcript, falls back to Cloudflare image-to-text conversion when necessary, and uses structured parsing with validation rather than accepting arbitrary model output. The rest of Atlas continues to work offline; the AI scan requires an internet connection.

## Run Atlas

Serve this folder through VS Code Live Server or another local static server, then open `index.html` through that server. Browsers block JSON loading when the file is opened directly with a `file://` address; Atlas will show a clear error instead of a blank screen in that case.

## Install Atlas

Atlas is an installable Progressive Web App. Serve it from `localhost` while developing or deploy it to an HTTPS host. In a supporting browser, use the address-bar install icon or the browser menu's **Install app** / **Add to Home Screen** action.

The app shell and saved schedule remain available offline after the first successful load. OCR still needs a connection the first time its recognition engine and language data are downloaded.

## Add your schedule

Edit `data/defaultSchedule.json`. JavaScript day numbers are Sunday `0` through Saturday `6`.

```json
{
  "semester": "First Semester 2026–2027",
  "classes": [
    {
      "id": "eng-math-mon",
      "code": "MATH101",
      "title": "Engineering Mathematics",
      "day": 1,
      "start": "08:00",
      "end": "12:00",
      "room": "S307",
      "instructor": ""
    }
  ]
}
```

The interface is entirely data-driven. Do not add classes directly to the HTML or view modules.

## Developer mode

Tap the **Atlas** title seven times quickly. The hidden panel can override the date and time, show the active route, show detected current/next classes, report the schedule source, and reset Atlas test data. Close it to return to the normal interface.

## Structure

- `data/` schedule data
- `js/services/` loading and validation
- `js/services/ocr.js` on-device image recognition
- `js/services/scheduleParser.js` OCR text to Atlas schedule conversion
- `js/utils/` time and HTML helpers
- `js/components/` reusable interface pieces
- `js/views/` route views
- `css/` tokens, global rules, layout, and components
