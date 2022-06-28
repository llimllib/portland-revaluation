import csv
import json
import locale

# set proper locale
locale.setlocale(locale.LC_ALL, "en_US.UTF-8")


def dig(obj, *keys):
    """
    Return obj[key_1][key_2][...] for each key in keys, or None if any key
    in the chain is not found

    So, given this `obj`:

    {
        "banana": {
            "cream": "pie"
        }
    }

    dig(obj, "banana") -> {"cream": "pie"}
    dig(obj, "banana", "cream") -> "pie"
    dig(obj, "banana", "rama") -> None
    dig(obj, "Led", "Zeppelin") -> None
    """
    for key in keys:
        try:
            obj = obj[key]
        except (KeyError, IndexError):
            return None
    return obj


def dedollar(s):
    try:
        return locale.atoi(s.strip("$"))
    except:
        return s


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
        "land_use_code",
        "zoning",
        "living_unit",
        "land_area_acreage",
        "land_area_square_footage",
    ]
)

pts = json.loads(open("../geodata.json").read())
for parcel, data in pts.items():
    assmts = dict((x[0], x) for x in data["assessments"])
    try:
        csvf.writerow(
            [
                parcel,
                dig(data, "parcelData", "PropertyLocation"),
                dedollar(dig(assmts, "2021", 1)),
                dedollar(dig(assmts, "2021", 2)),
                dedollar(dig(assmts, "2021", 3)),
                dedollar(dig(assmts, "2020", 1)),
                dedollar(dig(assmts, "2020", 2)),
                dedollar(dig(assmts, "2020", 3)),
                dig(data, "geo", "lat"),
                dig(data, "geo", "lng"),
                dig(data, "parcelData", "LandUseCode"),
                dig(data, "parcelData", "Zoning"),
                dig(data, "parcelData", "LandArea(acreage)"),
                dig(data, "parcelData", "LandArea(squarefootage)"),
            ]
        )
    except KeyError:
        print(parcel, data)
        raise

outf.close()
