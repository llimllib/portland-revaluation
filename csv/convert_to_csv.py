import json
import csv

outf = open("pts.csv", "w")
csvf = csv.writer(outf)

csvf.writerow(
    [
        "parcel",
        "address",
        "2021_land",
        "2021_building",
        "2021_total",
        "2020_land",
        "2020_building",
        "2020_total",
        "lat",
        "lng",
    ]
)

pts = json.loads(open("../map2/pts.json").read())
for pt in pts["features"]:
    p = pt["properties"]
    try:
        lng, lat = pt["geometry"]["coordinates"]
        csvf.writerow(
            [
                p["parcel"],
                p["address"],
                p["y2021"]["land"],
                p["y2021"]["building"],
                p["y2021"]["total"],
                p["y2020"]["land"],
                p["y2020"]["building"],
                p["y2020"]["total"],
                lat,
                lng,
            ]
        )
    except KeyError:
        print(pt)
        raise

outf.close()
