import json

geodata = json.load(open("geodata.json"))
for parcel, data in geodata.items():
    data["geo"]["lng"], data["geo"]["lat"] = (
        data["geo"]["lat"],
        data["geo"]["lng"],
    )
json.dump(geodata, open("geodata.json", "w"), indent=2)
