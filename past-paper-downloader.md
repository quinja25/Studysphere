# IB Past Paper Downloader

Downloads IB past papers from `arrib.qzz.io` organized by year and exam session.

## Source

- Website: https://arrib.qzz.io/
- Section: "Download past papers by subjects"
- Data files used:
  - `subject-names.txt` — list of all available subjects
  - `exam-sessions.txt` — list of exam sessions (May/November 2010–2025)
  - `file-paths.txt` — full file paths for all papers

## How It Works

1. Fetches `file-paths.txt` from the site (contains ~25k+ file paths)
2. Filters by subject name (e.g. `Economics`, `Biology`)
3. Filters by year range and exam session (May/November)
4. Optionally excludes language variants (e.g. French, Spanish)
5. Downloads each PDF from `https://arrib.qzz.io/IB%20PAST%20PAPERS%20-%20YEAR/<encoded-path>`
6. Saves to a local directory organized as: `Subject Past Papers/YEAR/Session YEAR/filename.pdf`

## URL Construction

```
Base path in file-paths.txt:
  ./2024 Examination Session/May 2024 Examination Session/PDFs/Individuals and societies/Economics_paper_1__HL.pdf

Becomes download URL:
  https://arrib.qzz.io/IB%20PAST%20PAPERS%20-%20YEAR/2024%20Examination%20Session/May%202024%20Examination%20Session/PDFs/Individuals%20and%20societies/Economics_paper_1__HL.pdf
```

## Usage

```bash
# Download economics papers
python download_economics.py

# Download biology papers
python download_biology.py
```

## Creating a New Subject Downloader

Copy one of the existing scripts and change:

1. **Subject filter** — change `"Economics"` or `"Biology"` to the target subject name (must match exactly as it appears in `subject-names.txt`)
2. **OUTPUT_DIR** — set the destination folder
3. **EXCLUDE list** — add any language variants to skip (e.g. `["French", "Spanish"]`)

### Available Subjects

Economics, Geography, History_route_1, Business_and_management, History_route_2, Psychology, ITGS, Social_and_cultural_anthropology, Philosophy, Biology, Chemistry, Physics, Mathematics, and many more. Full list at `subject-names.txt`.

## Notes

- Scripts skip already-downloaded files, so they're safe to re-run
- A 0.2s delay between downloads avoids overloading the server
- Uses the `requests` Python library
