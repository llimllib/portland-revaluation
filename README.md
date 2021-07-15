# Portland Reassessment Scraper

The code is gross and the naming is terrible, but here's roughly what the parts are:

- `run.js` is a puppeteer script to download a list of all(-ish?) parcel IDs, and stores them in `parcels.json`
- `reval.mjs` is a puppeteer script that takes a list of parcel IDs on stdin and gets the detailed property information and assessment history for that parcel
- `run.py` is a script to grab bunches of parcel IDs from `parcels.json`, then launches an instance of `reval.mjs` to grab the detailed history for them. It stores the result in `property_data.json`
- `clean.py` takes `property_data.json` as input, cleans it up into more useful data structures and revmoes the errored parcels. It outputs `cleaned_data.json`
- `geocode.py` takes `cleaned_data.json` and geocodes all the addresses in that file with mapbox
    - it expects a mapbox API key in the `MAPBOX_API_TOKEN` environment variable

The `map` directory contains a work-in-progress map of the revaluation data.

`map2` contains a second cut at the map, available at [https://billmill.org/reassess/](https://billmill.org/reassess/)

I have the `run.py`/`reval.mjs` split because it seems that any one process running for too long starts to have errors, so I settled on just launching a new process every 15 parcels to keep things moving. It's gross but it works(ish).

For some reason that I cannot understand, neither puppeteer script works in headless mode, so I'm just leaving my spare computer running on the side, popping up all kinds of windows to do the scraping.
