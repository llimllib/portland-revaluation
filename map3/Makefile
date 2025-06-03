.PHONY: publish
publish:
	rsync -avuz {index.html,map.js} ../../Newsite/template/reassess2025/
	rsync -avuz {property_values.geojson,leaflet} ../../Newsite/cdn/reassess2025/
	(cd ../../Newsite && make cdn build deploy)

.PHONY: serve
serve:
	devd -ol .
