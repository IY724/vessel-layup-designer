/**
 * docStamp.ts — 文档标记
 *
 * 顶栏、状态栏、PDF 属性、Excel 属性共用同一份标记。改归属信息只改这里。
 *
 * 说明：本项目对外交付件不再包含任何个人/院校署名标识，imprint 与
 * imprintShort 统一为空字符串。保留这两个导出名是为了让顶栏、状态栏、
 * PDF/Excel 属性等调用点无需改动即可继续编译（空串渲染为无内容）。
 */

/** 完整标记：顶栏、PDF 属性、Excel 属性（已停用，恒为空） */
export const imprint = ''

/** 短标记：状态栏、页脚等窄位置（已停用，恒为空） */
export const imprintShort = ''
