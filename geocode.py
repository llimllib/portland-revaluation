import json
import os
import time

import mapbox

MAPBOX_API_TOKEN = os.environ["MAPBOX_API_TOKEN"]

GEOCODE = mapbox.Geocoder(access_token=os.environ["MAPBOX_API_TOKEN"])


def geocode(addr):
    res = GEOCODE.forward(f"{addr}, Portland, ME")
    if res.headers.get("X-Rate-Limit-Limit") == "0":
        deltatime = res.headers["X-Rate-Limit-Reset"] - time.time()
        print("sleeping", deltatime)
        time.sleep(deltatime)

    if res.ok:
        data = res.json()
        if len(data["features"]) == 0:
            return {"error": "Unable to geocode"}

        feat = data["features"][0]
        return {
            "lat": feat["center"][0],
            "lng": feat["center"][1],
            "full_name": feat["place_name"],
        }
    else:
        import ipdb

        ipdb.set_trace()


data = json.load(open("cleaned_data.json"))
if os.path.exists("geodata.json"):
    geodata = json.load(open("geodata.json"))
else:
    geodata = {}
n = 0
for parcel_id, data in data.items():
    if parcel_id in geodata:
        continue
    geodata[parcel_id] = data
    geodata[parcel_id]["geo"] = geocode(
        geodata[parcel_id]["parcelData"]["PropertyLocation"]
    )
    n += 1
    if n % 100 == 0:
        print(n)
        json.dump(geodata, open("geodata.json", "w"), indent=2)
json.dump(geodata, open("geodata.json", "w"), indent=2)
