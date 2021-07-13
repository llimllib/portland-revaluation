import json
import os

import mapbox

property_data = json.load(open("property_data.json"))

cleaned = {}

errors = 0
for parcel, data in property_data.items():
    # I don't have a good data type for errors, so assume it's an error if
    # assessments isn't in there
    if 'assessments' not in parcel:
        errors += 1
        continue

    assessments = {}
    for year, land, building, total, std_exemption, other_exemption, taxable_value in parcel['assessments'][1:]:
        assessments[year] = {
            "land": land,
            "building": building,
            "total": total,
            "std_exemption": std_exemption,
            "other_exemption": other_exemption,
            "taxable_value": taxable_value,
        }


