#!/usr/bin/env python3
"""Поле из /tmp/shots-data.json: python3 shot_field.py order.id"""
import json, sys

if len(sys.argv) < 2:
    sys.exit('usage: shot_field.py order.id')
data = json.load(open('/tmp/shots-data.json'))
cur = data
for part in sys.argv[1].split('.'):
    cur = (cur or {}).get(part)
print(cur if cur is not None else '')
