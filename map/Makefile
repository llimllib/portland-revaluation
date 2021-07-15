.PHONY: publish
publish:
	rsync -avuz {index.html,map.js} ../../Newsite/template/reassess/
	rsync -avuz {pts.json,portland.json} ../../Newsite/cdn/reassess/
	(cd ../../Newsite && make cdn build deploy)

.PHONY: serve
serve:
	devd -ol .
