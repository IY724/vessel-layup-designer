"""从上游 Noto Serif SC 生成计算书离线字体子集。保留 OFL 许可，修改后重命名。"""
from pathlib import Path
import argparse
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
import base64

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
chars = set()
for file in (root / 'src').rglob('*'):
    if file.suffix in {'.ts', '.tsx'}:
        chars.update(file.read_text(encoding='utf-8'))
codepoints = set(range(0x20, 0x250)) | set(range(0x370, 0x400)) | set(range(0x2000, 0x2300)) | {ord(c) for c in chars}
font = TTFont(args.source)
font = instantiateVariableFont(font, {'wght': 400}, inplace=True)
options = subset.Options()
options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
options.name_legacy = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)
for name_id, value in [(1, 'Vessel Report Serif'), (3, 'VesselReportSerif-Regular'), (4, 'Vessel Report Serif Regular'), (6, 'VesselReportSerif-Regular')]:
    for rec in list(font['name'].names):
        if rec.nameID == name_id:
            font['name'].setName(value, name_id, rec.platformID, rec.platEncID, rec.langID)
out = root / 'src/assets/report-font'
out.mkdir(parents=True, exist_ok=True)
from io import BytesIO
buffer = BytesIO()
font.save(buffer)
(out / 'ReportSerif.base64').write_text(base64.b64encode(buffer.getvalue()).decode('ascii'), encoding='ascii')
print(f'Report font: {len(font.getBestCmap())} glyphs, {len(buffer.getvalue())} bytes')
