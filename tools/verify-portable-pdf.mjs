/** 正常启动便携外壳，连接它启动的实际桌面窗口，检查预览与保存生成的字节。 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const executable=path.resolve(process.argv[2])
const out=path.resolve(process.env.PDF_QA_OUT || 'output/qa/pdf-portable')
await mkdir(out,{recursive:true})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const port=9479
spawn(executable,[`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(out,'portable-final-profile')}`],{env,stdio:'ignore',windowsHide:true})
let browser
try {
  let ready=false
  for(let i=0;i<240;i++){
    try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.ok(ready,'便携程序实际窗口未就绪')
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page=browser.contexts()[0].pages()[0]
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.getByRole('button',{name:'恢复默认',exact:true}).click()
  await page.evaluate(()=>{
    globalThis.portablePdfBlob=null
    const original=URL.createObjectURL.bind(URL)
    URL.createObjectURL=blob=>{if(blob.type==='application/pdf')globalThis.portablePdfBlob=blob;return original(blob)}
    const click=HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.pdf'))return click.call(this)}
  })
  await page.getByRole('button',{name:'导出 PDF 计算书',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.pdf-view')?.getAttribute('aria-busy')==='false',undefined,{timeout:60000})
  assert.equal(await page.getByRole('alert').count(),0)
  assert.ok(await page.locator('.pdf-view canvas').evaluate(canvas=>{
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data
    let dark=0;for(let i=0;i<data.length;i+=16)if(data[i]<150&&data[i+1]<150&&data[i+3]>0)dark++
    return dark>1000
  }))
  const pages=Number(await page.getByLabel('PDF 页码').getAttribute('max'))
  await page.getByRole('button',{name:'保存 PDF',exact:true}).click()
  const bytes=Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await globalThis.portablePdfBlob.arrayBuffer()))))
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>50000)
  await writeFile(path.join(out,'portable-default.pdf'),bytes)
  await page.screenshot({path:path.join(out,'portable-preview.png')})
  assert.deepEqual(errors,[])
  const result={executable,pages,pdfBytes:bytes.length,previewRendered:true,saveBytesVerified:true,nativeSaveDialog:'verified separately in win-unpacked of same build',errors,checkedAt:new Date().toISOString()}
  await writeFile(path.join(out,'portable-verification.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
} finally {
  if(browser){
    const session=await browser.newBrowserCDPSession()
    await Promise.race([session.send('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))])
    await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))])
  }
}
