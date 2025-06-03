import json
import re


def getyear(assessments, year):
    l = list(filter(lambda x: x[0] == year, assessments))
    return l[0] if len(l) > 0 else []


def flt(n):
    n = re.sub(r"[\$,]", "", n)
    return float(n)


# {
#  "type": "FeatureCollection",
#  "features": [
#    {
#      "type": "Feature",
#      "geometry": {
#        "type": "Point",
#        "coordinates": [102.0, 0.5]
#      },
#      "properties": {
#        "prop0": "value0"
#      }
#    },
geojson = {"type": "FeatureCollection", "features": []}

alldata = json.load(open("../geodata.json"))
for parcel, data in alldata.items():
    y2021 = getyear(data["assessments"], "2021")
    y2020 = getyear(data["assessments"], "2020")
    if not y2021 or not y2020:
        continue
    obj = {
        "type": "Feature",
        "properties": {
            "parcel": parcel,
            "address": data["parcelData"]["PropertyLocation"].title(),
            "y2021": {
                "land": flt(y2021[1]),
                "building": flt(y2021[2]),
                "total": flt(y2021[3]),
            },
            "y2020": {
                "land": flt(y2020[1]),
                "building": flt(y2020[2]),
                "total": flt(y2020[3]),
            },
        },
        "geometry": {
            "type": "Point",
            "coordinates": [data["geo"]["lng"], data["geo"]["lat"]],
        },
    }

    try:
        obj["properties"]["diff"] = {
            "land": obj["properties"]["y2021"]["land"]
            / obj["properties"]["y2020"]["land"],
            "building": obj["properties"]["y2021"]["building"]
            / obj["properties"]["y2020"]["building"],
            "total": obj["properties"]["y2021"]["total"]
            / obj["properties"]["y2020"]["total"],
        }
    except ZeroDivisionError:
        continue
    geojson["features"].append(obj)

json.dump(geojson, open("pts.json", "w"))
