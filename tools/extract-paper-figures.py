"""从本地论文直接提取嵌入图像，保留原始像素及内部标注，不重绘、不缩放。"""
from pathlib import Path
from hashlib import sha256
import base64
import json
import sys
import fitz

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / '00_原始参考资料/朱宁 - 2023 - Ⅳ型高压储氢气瓶结构设计及优化研究.pdf'
doc = fitz.open(source)
source_hash = sha256(source.read_bytes()).hexdigest()
assets = root / 'src/assets/report-figures'
review = root.parent / '_work/pdf_20261017/source-figures'
assets.mkdir(parents=True, exist_ok=True)
review.mkdir(parents=True, exist_ok=True)
figures = {}
for name, page_number, printed_page, number in [('netting', 35, 20, '2.3'), ('domeTheory', 37, 22, '2.4')]:
    page = doc[page_number - 1]
    assert f'图{number}' in ''.join(page.get_text().split()), (page_number, number)
    embedded = page.get_image_info(xrefs=True)
    assert len(embedded) == 1 and embedded[0]['xref'] > 0, (page_number, embedded)
    info = embedded[0]
    pixmap = fitz.Pixmap(doc, info['xref'])
    assert pixmap.colorspace.n == 3 and not pixmap.alpha
    png = pixmap.tobytes('png')
    figures[name] = {
        'base64': base64.b64encode(png).decode('ascii'), 'width': pixmap.width, 'height': pixmap.height,
        'source': {'file': source.name, 'pdfSha256': source_hash, 'pdfPage': page_number,
                   'printedPage': printed_page, 'figure': number, 'bbox': info['bbox'],
                   'rgbSha256': sha256(pixmap.samples).hexdigest()},
    }
    (review / f'zhu-{name}.png').write_bytes(png)
    # 完整相关页保留，检查原图、图题及周边正文的对应关系。
    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(review / f'paper-page-{page_number}.png')
    print(f'{name}: PDF page {page_number}, figure {number}, {pixmap.width} x {pixmap.height}, {len(png)} bytes')
(assets / 'zhuFigures.json').write_text(json.dumps(figures, ensure_ascii=False, indent=2), encoding='utf-8')
