#!/usr/bin/env python3
r"""Пост-обработка docx: \* arabic в поле PAGE футера, удаление пустых <w:pgNumType/>."""
import re, shutil, sys, zipfile, os

SRC = "/home/z/my-project/download/DF26-WAVE1/DF26-WAVE1-QUEUE21-PLAN-v1.1.docx"
TMP = SRC + ".tmp"

with zipfile.ZipFile(SRC, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

patched = []
for n in list(data.keys()):
    if re.match(r"word/footer\d*\.xml$", n):
        xml = data[n].decode("utf-8")
        new_xml, cnt = re.subn(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            r"\1 PAGE \\* arabic \\* MERGEFORMAT \2",
            xml,
        )
        if cnt:
            data[n] = new_xml.encode("utf-8")
            patched.append((n, cnt))
    if n == "word/document.xml":
        xml = data[n].decode("utf-8")
        new_xml, cnt = re.subn(r"<w:pgNumType/>", "", xml)
        if cnt:
            data[n] = new_xml.encode("utf-8")
            patched.append(("document.xml pgNumType removed", cnt))

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(TMP, SRC)
print("Patched:", patched)
