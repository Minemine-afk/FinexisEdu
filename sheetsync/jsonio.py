"""Read and write the university JSON files exactly as they are laid out on disk.

Some files keep small objects (a fee block, a feeHistory entry) on one line. json.dumps would
expand them, which would turn a one-cell edit into a noisy diff, so objects whose first key is
written inline somewhere in the original file are written inline again.
"""
import json
import re
from pathlib import Path

_INLINE_FIRST_KEY = re.compile(r'\{ ("[^"\n]+"): ')
_INLINE_ARRAY = re.compile(r'": \["')
_STRING_ARRAY = re.compile(r'\[\n((?:[ ]+"(?:[^"\\\n]|\\.)*",?\n)+)[ ]*\]')
_FLAT_OBJECT = re.compile(r'\{\n((?:[ ]+"[^"\n]+": [^\n{\[][^\n]*\n)+)[ ]*\}')


def read(path: Path) -> tuple[dict, str]:
    text = path.read_text()
    return json.loads(text), text


def dumps(data: dict, original_text: str) -> str:
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if _INLINE_ARRAY.search(original_text):
        text = _STRING_ARRAY.sub(lambda m: "[" + ", ".join(x.strip().rstrip(",") for x in m[1].splitlines()) + "]", text)
    inline_keys = set(_INLINE_FIRST_KEY.findall(original_text))
    if not inline_keys:
        return text

    def collapse(m: re.Match) -> str:
        members = [line.strip().rstrip(",") for line in m[1].splitlines()]
        if members[0].split(":")[0] not in inline_keys:
            return m[0]
        return "{ " + ", ".join(members) + " }"

    return _FLAT_OBJECT.sub(collapse, text)
