#!/usr/bin/env python3
import json
import re
import sqlite3
import os


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


# Connect to the SQLite database
db_path = "property_data.db"
if not os.path.exists(db_path):
    print(f"Database file {db_path} not found!")
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Get all properties without errors
cursor = conn.cursor()
cursor.execute("SELECT * FROM properties WHERE error IS NULL")
properties = cursor.fetchall()

# Get all property details
cursor.execute("SELECT * FROM property_details")
property_details_rows = {row["parcel"]: row for row in cursor.fetchall()}

# Get all owner details
cursor.execute("SELECT * FROM owner_details")
owner_details_rows = {row["parcel"]: row for row in cursor.fetchall()}

# Get all assessments
cursor.execute(
    """
    SELECT parcel, year, land, building, total, 
           standard_exemption, other_exemption, taxable_value 
    FROM assessments
    ORDER BY parcel, year DESC
"""
)
assessments = cursor.fetchall()

# Group assessments by parcel
assessments_by_parcel = {}
for row in assessments:
    parcel = row["parcel"]
    if parcel not in assessments_by_parcel:
        assessments_by_parcel[parcel] = []

    # Format as in the original format - string with $ and commas
    assessment_row = [
        str(row["year"]),
        f"${row['land']:,.0f}",
        f"${row['building']:,.0f}",
        f"${row['total']:,.0f}",
        f"${row['standard_exemption']:,.0f}",
        f"${row['other_exemption']:,.0f}",
        f"${row['taxable_value']:,.0f}",
    ]
    assessments_by_parcel[parcel].append(assessment_row)

# Process each property
cleaned = {}
errors = 0
success_count = 0

for prop in properties:
    parcel_id = prop["parcel"]

    # Skip properties with no assessments
    if parcel_id not in assessments_by_parcel:
        errors += 1
        continue

    cleaned[parcel_id] = {}

    # Add assessments
    cleaned[parcel_id]["assessments"] = assessments_by_parcel[parcel_id]

    # Build parcelData dictionary
    parcel_data = {
        "ParcelID": parcel_id,
        "PropertyLocation": prop["address"] or "",
        "LandUseCode": prop["parcel_type"] or "",
    }

    # Add property details if available
    if parcel_id in property_details_rows:
        details = property_details_rows[parcel_id]
        if details["unit"]:
            parcel_data["Unit"] = details["unit"].strip() if details["unit"] else ""
        if details["living_unit"]:
            parcel_data["LivingUnit"] = details["living_unit"]
        if details["land_area"]:
            parcel_data["LandArea(acreage)"] = details["land_area"]
        if details["notes"]:
            parcel_data["Notes"] = details["notes"]
        if details["utilities"]:
            parcel_data["Utilities"] = details["utilities"]

        # Add any additional fields
        if details["additional_fields"]:
            try:
                additional = json.loads(details["additional_fields"])
                for key, value in additional.items():
                    # Remove whitespace from keys for consistency
                    parcel_data[remove_whitespace(key)] = tryn(value)
            except:
                pass

    cleaned[parcel_id]["parcelData"] = parcel_data

    # Build ownerData dictionary
    owner_data = {"Owner": prop["owner1"] or ""}

    if prop["owner2"]:
        owner_data["Owner2"] = prop["owner2"]

    # Add owner details if available
    if parcel_id in owner_details_rows:
        details = owner_details_rows[parcel_id]
        if details["mailing_address"]:
            owner_data["Address"] = details["mailing_address"]
        if details["city_state_zip"]:
            owner_data["City,State,Zip"] = details["city_state_zip"]
        if details["deed_date"]:
            owner_data["DeedDate"] = details["deed_date"]
        if details["book"]:
            owner_data["Book"] = details["book"]
        if details["page"]:
            owner_data["Page"] = details["page"]

        # Add any additional fields
        if details["additional_fields"]:
            try:
                additional = json.loads(details["additional_fields"])
                for key, value in additional.items():
                    # Remove whitespace from keys for consistency
                    owner_data[remove_whitespace(key)] = tryn(value)
            except:
                pass

    cleaned[parcel_id]["ownerData"] = owner_data
    success_count += 1

# Report statistics
print(f"{errors} errors, {success_count} successful properties processed")

# Write the cleaned data to JSON
json.dump(cleaned, open("cleaned_data.json", "w"), indent=2)
print(f"Cleaned data written to cleaned_data.json")

conn.close()
