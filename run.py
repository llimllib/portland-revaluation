#!/usr/bin/env python3
from itertools import zip_longest
import json
import shlex
import subprocess


def grouper(iterable, n, fillvalue=None):
    "Collect data into fixed-length chunks or blocks"
    # grouper('ABCDEFG', 3, 'x') --> ABC DEF Gxx"
    args = [iter(iterable)] * n
    return zip_longest(*args, fillvalue=fillvalue)


def sh(cmd):
    print(cmd)
    proc = subprocess.Popen(shlex.split(cmd), stdout=subprocess.PIPE)
    output = proc.communicate()[0].decode("utf8")
    ret = proc.returncode
    return output, ret


parcels = json.load(open("parcels.json"))
property_data = json.load(open("property_data.json"))

# remove all keys in property_data from parcels; we don't want to repeat
# the scrape
for key in property_data:
    try:
        del parcels[key]
    except KeyError:
        continue

for parcels in grouper(parcels, 15):
    args = " ".join(f'"{p}"' for p in parcels if p)
    sh(f"node reval.mjs {args}")
