#!/usr/bin/env
import json
import re


def tryn(maybe_n):
    try:
        n = int(maybe_n)
        return n
    except ValueError:
        try:
            n = float(maybe_n)
            return n
        except ValueError:
            return maybe_n


def remove_whitespace(s):
    return re.sub(r"\s", "", s)


def dictize(list_of_pairs):
    data = {}
    for kv in list_of_pairs:
        if kv == [""]:
            continue
        k, v = kv
        try:
            k = remove_whitespace(k)
        except TypeError:
            print(k, type(k))
            raise

        # if the value has nothing but whitespace, set it to empty if there's
        # a key, then otherwise skip ahead
        if not remove_whitespace(v):
            if k:
                data[k] = ""
            continue

        # skip the "verify with legal" rows
        if v.startswith("Verify"):
            continue

        if k:
            data[k] = tryn(v)
            prev_k = k
        else:
            # if there wasn't a key, add this line to the previous key.
            # Convert to list if necessary
            if isinstance(data[prev_k], list):
                data[prev_k].append(tryn(v))
            else:
                data[prev_k] = [data[prev_k], tryn(v)]

    return data


property_data = json.load(open("property_data.json"))

cleaned = {}
errors = 0
for parcel_id, data in property_data.items():
    # I don't have a good data type for errors, so assume it's an error if
    # assessments isn't in there
    if "assessments" not in data:
        errors += 1
        continue

    cleaned[parcel_id] = {}

    cleaned[parcel_id]["assessments"] = list(
        filter(lambda y: len(y) == 7, data["assessments"][1:])
    )

    cleaned[parcel_id]["parcelData"] = dictize(data["parcelData"])
    cleaned[parcel_id]["ownerData"] = dictize(data["ownerData"])
    # I'm going to do this in a separate script
    # cleaned[parcel_id]["geo"] = geocode(
    #     cleaned[parcel_id]["parcelData"]["PropertyLocation"]
    # )

print(f"{errors} errors, {len(property_data)-errors} nominal")
json.dump(cleaned, open("cleaned_data.json", "w"), indent=2)
