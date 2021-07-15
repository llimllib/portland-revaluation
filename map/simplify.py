import json
import re


def getyear(assessments, year):
    l = list(filter(lambda x: x[0] == year, assessments))
    return l[0] if len(l) > 0 else []


def flt(n):
    n = re.sub(r"[\$,]", "", n)
    return float(n)


alldata = json.load(open("../geodata.json"))
pts = []
for parcel, data in alldata.items():
    y2021 = getyear(data["assessments"], "2021")
    y2020 = getyear(data["assessments"], "2020")
    if not y2021 or not y2020:
        continue
    obj = {
        "parcel": parcel,
        "2021": {
            "land": flt(y2021[1]),
            "building": flt(y2021[2]),
            "total": flt(y2021[3]),
        },
        "2020": {
            "land": flt(y2020[1]),
            "building": flt(y2020[2]),
            "total": flt(y2020[3]),
        },
        "geo": data["geo"],
    }

    try:
        obj["diff"] = {
            "land": obj["2021"]["land"] / obj["2020"]["land"],
            "building": obj["2021"]["building"] / obj["2020"]["building"],
            "total": obj["2021"]["total"] / obj["2020"]["total"],
        }
    except ZeroDivisionError:
        continue
    pts.append(obj)

json.dump(pts, open("pts.json", "w"))
