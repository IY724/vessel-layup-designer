"""从网站公式清单生成 Excel 内嵌公式图片；仅开发时需要 Python / matplotlib。"""
from pathlib import Path
from io import BytesIO
import base64
import json
import re
import matplotlib
matplotlib.use('Agg')
from matplotlib import mathtext
from matplotlib.font_manager import FontProperties
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
matplotlib.rcParams.update({
    'mathtext.fontset': 'custom',
    'mathtext.rm': 'Microsoft YaHei',
    'mathtext.it': 'STIXGeneral:italic',
    'mathtext.bf': 'STIXGeneral:bold',
    'mathtext.fallback': 'stix',
})
source = (ROOT / 'src/core/excelRef.ts').read_text(encoding='utf-8')
rows = re.findall(r"label: '([^']+)', formula: '((?:\\.|[^'])*)', purpose: '([^']+)'", source)
assert len(rows) >= 16, '未读到完整公式清单'
assets = []
for label, escaped, purpose in rows:
    tex = escaped.replace('\\\\', '\\')
    image = BytesIO()
    mathtext.math_to_image('$' + tex + '$', image, prop=FontProperties(size=18), dpi=216, format='png', color='#17364D')
    picture = Image.open(image).convert('RGB')
    picture = ImageOps.expand(picture, border=20, fill='white')
    encoded = BytesIO()
    picture.save(encoded, format='PNG', optimize=True)
    assets.append({'label': label, 'tex': tex, 'purpose': purpose,
                   'width': picture.width, 'height': picture.height,
                   'base64': base64.b64encode(encoded.getvalue()).decode('ascii')})
output = ROOT / 'src/export/formulaImages.json'
output.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('已生成', len(assets), '条公式图片：', output)
