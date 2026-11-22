import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { copyFile,readFile,writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
export async function checkTransport({directory,evidence,main,settings,until,log,onFixtureReady}){
 const nonce=randomBytes(6).toString('hex')
 const filename='mi-qa-smtc-'+nonce+'.exe',exe=path.join(evidence,filename)
 const expectedAumid='MusicIsland.QA.'+nonce
 const possible=new Set([expectedAumid,filename,exe].map(s=>s.toLowerCase()))
 await copyFile(path.join(directory,'smtc-fixture.exe'),exe)
 const fixture=spawn(exe,[nonce],{cwd:evidence,windowsHide:true,stdio:'ignore'})
 let ownedId=null
 const eventsPath=path.join(evidence,'fixture-events.txt')
 const events=()=>readFile(eventsPath,'utf8').catch(()=> '')
 const live=()=>{assert.ok(fixture.pid && fixture.exitCode===null && !fixture.killed,'Test source exited')}
 const invoke=(page,command)=>page.evaluate(cmd=>window.__TAURI_INTERNALS__.invoke(cmd),command)
 const setSource=async(source)=>settings.evaluate(async source=>{
    const api=window.__TAURI_INTERNALS__
    const base=await api.invoke('get_config')
    if(base.media.protocol!=='smtc'||base.media.directYandexConsent)throw new Error('Unexpected media protocol')
    const edited={...base,media:{...base.media,preferredSourceAppId:source}}
    return (await api.invoke('save_config',{config:edited,base})).media.preferredSourceAppId
 },source)
 const guard=async()=>{
   live()
   assert.ok(ownedId && possible.has(ownedId.toLowerCase()))
   const pref=(await invoke(settings,'get_config')).media
   assert.equal(pref.protocol,'smtc');assert.equal(pref.directYandexConsent,false);assert.equal(pref.preferredSourceAppId,ownedId)
   const m=await invoke(main,'get_media_snapshot')
   assert.equal(m.sourceAppId,ownedId);assert.equal(m.title,'Island QA '+nonce)
   live();return m
 }
 let pinned=false
 try{
   await until(async()=>{const s=await events();if(s.includes('error '))throw new Error(s);live();return s.includes('ready')},8000)
   const match=await until(async()=>{live();const sessions=await invoke(main,'list_media_sessions');return sessions.find(s=>possible.has(s.sourceAppId.toLowerCase()))},18000)
   ownedId=match.sourceAppId
   assert.equal((await invoke(settings,'get_config')).media.preferredSourceAppId,null)
   assert.equal(await setSource(ownedId),ownedId)
   pinned=true
   await until(async()=>{const m=await invoke(main,'get_media_snapshot');return m.sourceAppId===ownedId && m.title==='Island QA '+nonce},8000)
   const play=main.locator('.island-card .play-button').first(),seek=main.locator('.island-card .progress-track').first()
   await play.waitFor()
   if(onFixtureReady) { await guard(); await onFixtureReady(); return }
   const shader=()=>main.locator('.island-card .island-feedback__ambient').evaluate(n=>({state:n.dataset.playbackMotion,opacity:Number(getComputedStyle(n).opacity),display:getComputedStyle(n).display,animations:n.getAnimations({subtree:true}).length}))
   const before=await guard();assert.equal(before.playbackStatus,'paused');assert.ok(before.canPlay)
   assert.match(await play.getAttribute('aria-label'),/^(Воспроизвести|Играть|Play)$/i)
   await play.click({timeout:3500})
   await until(async()=> (await events()).split(/\r?\n/).includes('play'))
   await until(async()=> (await guard()).playbackStatus==='playing')
   const whilePlaying=await until(async()=>{const s=await shader();return s.state==='playing'&&s.opacity>0.35&&s.display!=='none'?s:null},3500).catch(()=>shader())
   await main.locator('.island-card').first().screenshot({path:path.join(evidence,'07-fixture-playing.png'),omitBackground:true,timeout:4000}).catch(()=>{})
   await until(async()=>/^(Приостановить|Пауза|Pause)$/i.test(await play.getAttribute('aria-label')))
   await guard()
   await play.click({timeout:3500})
   await until(async()=> (await events()).split(/\r?\n/).includes('pause'))
   await until(async()=> (await guard()).playbackStatus==='paused')
   const whilePaused=await until(async()=>{const s=await shader();return s.state==='paused'&&s.opacity===0&&s.display==='none'?s:null},3500).catch(()=>shader())
   await main.locator('.island-card').first().screenshot({path:path.join(evidence,'08-fixture-paused.png'),omitBackground:true,timeout:4000}).catch(()=>{})
   const paused=await guard()
   assert.ok(paused.canSeek)
   await seek.press('ArrowRight')
   const seekMs=await until(async()=>{const m=(await events()).match(/^seek (\d+)/m);return m && Number(m[1])})
   assert.ok(Math.abs(seekMs-17000)<=1500,'Keyboard seek should move the 12-second fixture ahead by five seconds')
   log.fixture={identity:ownedId,play:true,pause:true,seekMs,initialMs:12000,durationMs:120000,whilePlaying,whilePaused}
   log.checks.push('Native Windows SMTC delivered Play, Pause and a keyboard seek exclusively to the unique local test process.')
 } finally {
   // Keep the strict preference until all dispatched work is acknowledged.
   // No more controls are issued after clearing this QA-only selection.
   await writeFile(path.join(evidence,'fixture-stop'),'done').catch(()=>{})
   if(fixture.exitCode==null){
     await Promise.race([new Promise(r=>fixture.once('exit',r)),new Promise(r=>setTimeout(r,1500))])
     if(fixture.exitCode==null)fixture.kill()
   }
   if(pinned && (await invoke(settings,'get_config')).media.preferredSourceAppId===ownedId)await setSource(null)
 }
}
