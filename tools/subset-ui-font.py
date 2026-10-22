#!/usr/bin/env python3
"""화면 글꼴(app/brand/noto-sans-kr.woff2, 'Onbatang UI')을 자주 쓰는 글자로 줄인다.

첫 화면의 여는 화면은 이 글꼴을 다 받을 때까지 기다리므로, 작을수록 첫 화면이 빨리 뜬다.
남기는 글자: KS X 1001 의 한글 2,350자 + 앱(app/ · src/)의 화면 글에 실제로 나오는 모든 글자 + 영문 · 숫자 · 문장부호 · 화살표 · 동그라미 숫자 같은 기호.
그 밖의 드문 글자는 브라우저가 기기 글꼴로 그린다. 굵기 축(wght 100~900)과 글꼴 기능(layout features)은 그대로 둔다.

쓰는 법(fontTools · brotli 가 필요하다: pip install fonttools brotli):
  python3 tools/subset-ui-font.py <원본 Noto Sans KR 가변 woff2 · ttf> app/brand/noto-sans-kr.woff2
원본: Google Fonts 의 Noto Sans KR 가변 글꼴(SIL OFL 1.1, app/brand/OFL.txt). 고친 판도 같은 OFL 로 나눈다.
"""
import glob
import sys
from fontTools import subset

ROOT = __file__.rsplit('/tools/', 1)[0]
RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x2030, 0x205E), (0x2100, 0x214F), (0x2190, 0x21FF), (0x2200, 0x22FF),
          (0x2460, 0x24FF), (0x2500, 0x257F), (0x25A0, 0x25FF), (0x2600, 0x26FF), (0x3000, 0x303F), (0x3131, 0x318E), (0xFF01, 0xFF5E)]


def characters():
    chars = set()
    for hi in range(0xB0, 0xC9):                     # KS X 1001 한글 2,350자
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('euc-kr'))
            except UnicodeDecodeError:
                pass
    files = glob.glob(f'{ROOT}/app/**/*.js', recursive=True) + glob.glob(f'{ROOT}/src/**/*.js', recursive=True) \
        + glob.glob(f'{ROOT}/app/*.html') + glob.glob(f'{ROOT}/app/**/*.css', recursive=True)
    for path in files:
        if 'vendor' in path or 'bundle' in path:
            continue
        chars.update(ch for ch in open(path, encoding='utf-8', errors='ignore').read() if ord(ch) >= 0x80)
    for lo, hi in RANGES:
        chars.update(chr(c) for c in range(lo, hi + 1))
    return ''.join(sorted(chars))


def main(source, target):
    options = subset.Options()
    options.layout_features = ['*']
    options.flavor = 'woff2'
    options.hinting = False
    font = subset.load_font(source, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=characters())
    subsetter.subset(font)
    subset.save_font(font, target, options)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
