getparcels: parcels.json
	@# download all parcel ids to parcels.json
	node run.js

reval: property_data.db
	@# download all parcel valuations and store them in property_data.db
	node --experimental-sqlite reval.js

convert: property_data.db
	@# convert property_data.json to sqlite property_data.db
	node --experimental-sqlite convert.js

clean: cleaned_data.json
	@# convert property_data.db to a cleaner json file suitable for downloading
	python clean.py

db:
	sqlite3 property_data.db
