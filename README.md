# Atlas v0.2.3

Atlas is a mobile-first student planner built with plain HTML, CSS, and vanilla JavaScript ES modules.

Version 0.2.3 improves mobile startup reliability, responsive sizing, page transitions, and reinstall recovery while reducing rendering work on mobile devices. It retains the schedule-image recognition improvements from Atlas v0.2.2.

## Import a schedule image

Open **Import** in the bottom navigation and choose a clear PNG, JPG, WebP, or camera photo of a tabular class schedule. Atlas uses Tesseract.js in the browser to read the image, converts recognized rows to the normal Atlas schedule structure, and requires a review before saving.

- The image and recognized text stay in the browser.
- The first scan requires internet access to download the OCR engine and English recognition data.
- Imported schedules are saved to `localStorage` under `atlas.schedule` and take priority over `data/defaultSchedule.json` on that device.
- Multi-day codes such as `TF`, `MWF`, and `TTH` become separate class entries for each day.
- Use **Restore default JSON schedule** from the Import view to remove the saved import.

OCR is an assisted import, not an authority. Always verify the review screen, particularly `S`/`5`, room codes, AM/PM, and multi-day abbreviations.

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
