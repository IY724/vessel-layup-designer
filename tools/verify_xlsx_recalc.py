# -*- coding: utf-8 -*-
"""
verify_xlsx_recalc.py — 对导出的 .xlsx 做 LibreOffice 独立重算核对。

流程：
  1. 用 soffice headless（独立 profile）把文件重算后另存到 <文件同目录>/recalc/；
     导出文件带 fullCalcOnLoad，LibreOffice 打开时会全部重算并写入结果。
  2. 逐单元格比较：原文件里公式的缓存值（软件内核算的） vs LibreOffice 重算值；
     数值按相对容差 1e-7，字符串按完全相等。
  3. 检查重算结果里没有错误值（#REF! / #NUM! / #DIV/0! 等）。

用法：python tools/verify_xlsx_recalc.py 导出1.xlsx [导出2.xlsx ...]
输出：每个文件打印一行 JSON {name, sheets, formulasCompared, errors, failures}；
     同时把汇总写到第一个文件所在目录的 recalc/公式重算核查.json。
"""
import json
import os
import subprocess
import sys
import tempfile

from openpyxl import load_workbook

SOFFICE = os.environ.get("SOFFICE", r"C:\Program Files\LibreOffice\program\soffice.exe")
REL_TOL = 1e-7
ABS_FLOOR = 1e-12


def rel_ok(a: float, b: float) -> bool:
    return abs(a - b) <= max(abs(a), abs(b)) * REL_TOL + ABS_FLOOR


def recalc(path: str, outdir: str) -> str:
    os.makedirs(outdir, exist_ok=True)
    profile = os.path.join(outdir, "_lo_profile")
    os.makedirs(profile, exist_ok=True)
    subprocess.run(
        [SOFFICE, "--headless", f"-env:UserInstallation=file:///{profile.replace(os.sep, '/')}",
         "--convert-to", "xlsx", "--outdir", outdir, path],
        check=True, capture_output=True, timeout=900,
    )
    out = os.path.join(outdir, os.path.basename(path))
    if not os.path.exists(out):
        raise RuntimeError(f"LibreOffice 未生成重算文件：{out}")
    return out


def compare(path: str, recalc_path: str) -> dict:
    wb_formula = load_workbook(path, data_only=False)
    wb_cached = load_workbook(path, data_only=True)
    wb_recalc = load_workbook(recalc_path, data_only=True)
    compared = 0
    errors, failures = [], []
    for ws_formula in wb_formula.worksheets:
        ws_cached = wb_cached[ws_formula.title]
        ws_recalc = wb_recalc[ws_formula.title]
        for row in ws_formula.iter_rows():
            for cell in row:
                if cell.data_type != "f":
                    continue
                v_src = ws_cached[cell.coordinate].value
                v_new = ws_recalc[cell.coordinate].value
                if isinstance(v_new, str) and v_new.startswith("#"):
                    errors.append({"cell": f"{ws_formula.title}!{cell.coordinate}", "value": v_new})
                    continue
                if v_src is None:
                    continue
                compared += 1
                if isinstance(v_src, (int, float)) and isinstance(v_new, (int, float)):
                    if not rel_ok(float(v_src), float(v_new)):
                        failures.append({"cell": f"{ws_formula.title}!{cell.coordinate}",
                                         "expected": float(v_src), "actual": float(v_new)})
                elif str(v_src) != str(v_new):
                    failures.append({"cell": f"{ws_formula.title}!{cell.coordinate}",
                                     "expected": v_src, "actual": v_new})
    return {"name": os.path.basename(path), "sheets": len(wb_formula.worksheets),
            "formulasCompared": compared, "errors": errors, "failures": failures}


def main(paths):
    reports = []
    for path in paths:
        outdir = os.path.join(os.path.dirname(os.path.abspath(path)), "recalc")
        recalc_path = recalc(path, outdir)
        report = compare(path, recalc_path)
        reports.append(report)
        print(json.dumps(report, ensure_ascii=False))
        if report["errors"] or report["failures"]:
            print(f"!! {report['name']} 存在错误或差异", file=sys.stderr)
    out = os.path.join(os.path.dirname(os.path.abspath(paths[0])), "recalc", "公式重算核查.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(reports, fh, ensure_ascii=False, indent=2)
    print("汇总写入:", out)
    return 1 if any(r["errors"] or r["failures"] for r in reports) else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
