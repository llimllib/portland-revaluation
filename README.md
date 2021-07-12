The code is gross and the naming is terrible, but here's roughly what the parts are:

- `run.js` is a puppeteer script to download a list of all(-ish?) parcel IDs, and stores them in `parcels.json`
- `reval.mjs` is a puppeteer script that takes a list of parcel IDs on stdin and gets the detailed property information and assessment history for that parcel
- `run.py` is a script to grab bunches of parcel IDs from `parcels.json`, then launches an instance of `reval.mjs` to grab the detailed history for them
