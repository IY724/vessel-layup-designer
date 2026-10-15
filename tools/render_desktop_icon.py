"""生成桌面软件的气瓶图标（PNG 与 Windows ICO）。"""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / 'desktop'
image = Image.new('RGBA', (512, 512))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((8, 8, 504, 504), 108, fill='#17364d')
draw.rounded_rectangle((194, 52, 318, 96), 12, fill='#f0cf81')
draw.rounded_rectangle((219, 88, 293, 131), 10, fill='#e4edf4')
draw.rounded_rectangle((132, 117, 380, 454), 118, fill='#edf5fc')
for y in range(160, 400, 38):
    draw.line((146, y, 366, y + 45), fill='#246a78', width=12)
    draw.line((146, y + 45, 366, y), fill='#76abb8', width=8)
draw.rounded_rectangle((132, 117, 380, 454), 118, outline='#edf5fc', width=10)
image.save(out / 'icon.png')
image.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('已生成桌面图标')
