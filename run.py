#!/usr/bin/env python3
import sqlite3
import subprocess
import os
import json


def get_properties_to_reprocess(db_path, parcels_json_path):
    """
    Get properties that:
    1. Have errors in the database
    2. Are missing 2025 assessment data
    3. Exist in parcels.json but not in the database
    """
    # Load parcels from JSON
    if not os.path.exists(parcels_json_path):
        print(f"Parcels JSON file {parcels_json_path} not found!")
        return []

    with open(parcels_json_path, "r") as f:
        parcels_json = json.load(f)

    parcels_to_process = set()

    # If database exists, get properties with errors or missing 2025 data
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print("getting all parcel ids from the database")
        cursor.execute("SELECT parcel FROM properties")
        existing_parcels = {row["parcel"] for row in cursor.fetchall()}

        print("selecting errored parcels")
        cursor.execute("SELECT parcel FROM properties WHERE error IS NOT NULL")
        error_parcels = {row["parcel"] for row in cursor.fetchall()}
        parcels_to_process.update(error_parcels)

        print("getting parcels without 2025 data")
        cursor.execute(
            """
            SELECT p.parcel 
            FROM properties p
            LEFT JOIN assessments a ON p.parcel = a.parcel AND a.year = 2025
            WHERE a.id IS NULL AND p.error IS NULL
        """
        )
        missing_2025_parcels = {row["parcel"] for row in cursor.fetchall()}
        parcels_to_process.update(missing_2025_parcels)

        # Find parcels in JSON but not in database
        new_parcels = set(parcels_json.keys()) - existing_parcels
        parcels_to_process.update(new_parcels)

        # Statistics for reporting
        error_count = len(error_parcels)
        missing_2025_count = len(
            missing_2025_parcels - error_parcels
        )  # Don't double count
        new_count = len(new_parcels)

        conn.close()
    else:
        # If no database exists, process all parcels from JSON
        parcels_to_process = set(parcels_json.keys())
        error_count = 0
        missing_2025_count = 0
        new_count = len(parcels_to_process)
        print(f"Database file {db_path} not found. Will process all parcels from JSON.")

    # Convert to list for final output
    parcels_list = list(parcels_to_process)

    print(f"Found {len(parcels_list)} properties to process:")
    print(f"- {error_count} with errors")
    print(f"- {missing_2025_count} missing 2025 data")
    print(f"- {new_count} new properties from parcels.json")

    return parcels_list


def main():
    db_path = "property_data.db"
    parcels_json_path = "parcels.json"

    # Get properties that need processing
    properties = get_properties_to_reprocess(db_path, parcels_json_path)

    if not properties:
        print("No properties need to be processed.")
        return

    # Get batch size
    batch_size = 20

    # Process in batches
    total_properties = len(properties)
    batches = [
        properties[i : i + batch_size] for i in range(0, total_properties, batch_size)
    ]

    for i, batch in enumerate(batches):
        print(f"\nProcessing batch {i+1}/{len(batches)} ({len(batch)} properties)...")

        # Prepare the reval.js command
        command = ["node", "--experimental-sqlite", "reval.js"] + batch

        # Run the command
        try:
            subprocess.run(command, check=True)
            print(f"Batch {i+1} complete!")
        except subprocess.CalledProcessError as e:
            print(f"Error during processing batch {i+1}: {e}")

    print("\nAll processing complete!")


if __name__ == "__main__":
    main()
