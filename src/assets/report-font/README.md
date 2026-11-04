# 计算书字体

上游：Google Fonts 的 [Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc)，SIL Open Font License 1.1，许可见同目录 `OFL.txt`。

`ReportSerif.base64` 是从上游可变 TTF 提取 400 字重，再根据项目中文文案和数学符号生成的静态 TrueType 子集，重命名为 Vessel Report Serif。网页构建时将许可嵌入 HTML 注释，离线导出无需联网或另装字体。

新增计算书文案包含新汉字时，执行：

```powershell
python tools/build-report-font.py <NotoSerifSC-variable.ttf>
```

上游原始文件：`https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf`。
