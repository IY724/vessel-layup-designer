"""重新打开实际保存的 PDF，校核文字、关键数值、长表及三种运行方式的一致性。"""
from pathlib import Path
import json
import math
import re
import sys
import fitz
from hashlib import sha256

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'output/qa/pdf'
reports = {}
normalized = []
paper_figures = json.loads((root / 'src/assets/report-figures/zhuFigures.json').read_text(encoding='utf-8'))
for mode in ['web', 'web-http', 'desktop']:
    doc = fitz.open(out / f'{mode}-default.pdf')
    text = '\n'.join(page.get_text() for page in doc)
    for token in ['203.649', '183.433', '152.736', '77.371', '18.840', '159.534']:
        assert token in text, (mode, token)
    assert '几何与线型设计 ·' not in text
    for topic in ['筒身薄膜内力与纤维受力分解', '层厚公式的推导与适用角度', '三次样条边界条件与体积约束', '气瓶筒身段微元示意图', '封头段纤维缠绕示意图']:
        assert topic in text, (mode, topic)
    image_xrefs = {entry[0] for page in doc for entry in page.get_images(full=True)}
    for name, original in paper_figures.items():
        matching = []
        for xref in image_xrefs:
            pixmap = fitz.Pixmap(doc, xref)
            if (pixmap.width, pixmap.height) == (original['width'], original['height']):
                matching.append(xref)
                assert sha256(pixmap.samples).hexdigest() == original['source']['rgbSha256'], (mode, name, '原图像素被改变')
                placements = [rect for page in doc for rect in page.get_image_rects(xref)]
                assert len(placements) == 1, (mode, name, '原图应实际放置一次')
                for rect in placements:
                    assert abs(rect.width / rect.height - original['width'] / original['height']) < 1e-5, (mode, name, '原图比例被改变')
        assert matching, (mode, name, '论文原图未实际嵌入PDF')
    assert 'varepsilon' not in text and 'Excel' not in text and '表格计算形式' not in text
    assert len(text) > 10000, '理论说明及变量定义应完整输出'
    layup = text[text.index('表 7 当前有序铺层方案'):text.index('5 筒身段强度校核')]
    expected = [('螺旋','15.00','8'),('环向','90.00','8'),('螺旋','20.00','8'),('环向','90.00','8'),
                ('螺旋','25.00','4'),('环向','90.00','4'),('螺旋','35.00','4'),('环向','90.00','4'),
                ('螺旋','40.00','4'),('环向','90.00','12')]
    for index, (kind, angle, layers) in enumerate(expected, 1):
        assert re.search(rf'\b{index}\s+{kind}\s+{angle}\s+{layers}\s', layup), (mode, index)
    assert '\ufffd' not in text
    clipped = []
    for number, page in enumerate(doc, 1):
        for block in page.get_text('blocks'):
            if block[0] < 45 or block[2] > 552 or block[1] < 18 or block[3] > 828:
                clipped.append([number, list(block[:4]), block[4][:70]])
    assert not clipped, clipped
    normalized.append(re.sub(r'计算时间[^\n]*\n', '', text))
    long = fitz.open(out / f'{mode}-long-table.pdf')
    long_text = '\n'.join(page.get_text() for page in long)
    table = long_text[long_text.index('表 7 当前有序铺层方案'):long_text.index('5 筒身段强度校核')]
    assert re.search(r'88\s+环向\s+90.00\s+2\s+0.600\s+启用', table), table[-500:]
    assert '停用' in table
    custom = fitz.open(out / f'{mode}-custom-kf.pdf')
    custom_text = '\n'.join(page.get_text() for page in custom)
    volume = (math.pi * 135**2 * 1282 + 4 * math.pi / 3 * 0.65 * 135**2 * 65) / 1e6
    assert '0.650' in custom_text and f'{volume:.3f}' in custom_text
    reports[mode] = {'pages': len(doc), 'longPages': len(long), 'selectableTextCharacters': len(text),
                     'table88RowsPreserved': True, 'pageBoundsPassed': True, 'customKfPassed': True,
                     'decorativeSubtitleAbsent': True, 'paperFiguresPixelsPreserved': True}
assert normalized[0] == normalized[1] == normalized[2], '三端 PDF 正文不一致'
report = {'passed': True, 'modes': reports, 'sameTextAcrossModes': True}
(out / 'content-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
