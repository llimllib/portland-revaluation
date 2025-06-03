import json
import sqlite3
from collections import defaultdict


def generate_property_geojson(database_file, output_file):
    """
    Connect to SQLite database and output property values as GeoJSON
    with a feature collection of properties.
    """
    print(f"Connecting to database: {database_file}")

    # Connect to the SQLite database
    conn = sqlite3.connect(database_file)
    conn.row_factory = sqlite3.Row  # This enables column access by name

    # Create cursor
    cursor = conn.cursor()

    # Query to get all properties with their addresses
    print("Querying properties and their assessment values...")
    cursor.execute(
        """
        SELECT 
            p.parcel, 
            p.address, 
            a.year, 
            a.land,
            a.building,
            a.total,
            g.lat,
            g.lon
        FROM 
            properties p
        LEFT JOIN 
            assessments a ON p.parcel = a.parcel
        LEFT JOIN 
            geolocation g ON p.parcel = g.parcel
        WHERE 
            a.year IN (2020, 2021, 2025)
            AND p.address IS NOT NULL
            AND p.address != ''
            AND g.lat IS NOT NULL
            AND g.lon IS NOT NULL
        ORDER BY 
            p.address
        """
    )

    # Process the results
    rows = cursor.fetchall()
    print(f"Found {len(rows)} assessment records")

    # Group the data by property parcel
    property_data = defaultdict(
        lambda: {
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "Point", "coordinates": []},
        }
    )

    for row in rows:
        parcel = row["parcel"]
        address = row["address"]
        year = row["year"]
        land_value = row["land"]
        building_value = row["building"]
        total_value = row["total"]
        lat = row["lat"]
        lon = row["lon"]

        # If this is the first time we're seeing this parcel, set basic properties
        if "address" not in property_data[parcel]["properties"]:
            property_data[parcel]["properties"]["parcel"] = parcel
            property_data[parcel]["properties"]["address"] = address
            property_data[parcel]["geometry"]["coordinates"] = [
                lon,
                lat,
            ]  # GeoJSON uses [longitude, latitude] order

        # Add the assessment values for this year
        year_key = f"y{year}"
        if year_key not in property_data[parcel]["properties"]:
            property_data[parcel]["properties"][year_key] = {}

        property_data[parcel]["properties"][year_key]["land"] = land_value
        property_data[parcel]["properties"][year_key]["building"] = building_value
        property_data[parcel]["properties"][year_key]["total"] = total_value

    # Convert to list of features
    features = list(property_data.values())
    print(f"Processed {len(features)} unique properties")

    # Create the GeoJSON FeatureCollection
    geojson = {"type": "FeatureCollection", "features": features}

    # Write to GeoJSON file
    print(f"Writing results to {output_file}")
    with open(output_file, "w") as f:
        json.dump(geojson, f, indent=2)

    # Close the connection
    conn.close()
    print("Done!")
    return len(features)


if __name__ == "__main__":
    database_file = "property_data.db"
    output_file = "property_values.geojson"
    count = generate_property_geojson(database_file, output_file)
    print(f"Successfully exported {count} properties to {output_file}")
