/* CB-IMAGE/1024 analog still-picture station UI and original V12 Web Serial. */
(()=>{
'use strict';
const C=globalThis.CBImage1024,$=id=>document.getElementById(id),enc=new TextEncoder(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PREFIX=[77,80,88,51],PREBUFFER=12000,BLOCK=2400;
let mode='444',sourceType='pattern',sourcePixels=null,photoId=1,wave=null,wavePos=0;
let session=null,pending=[],rxLastIndex=null,lastPacketAt=0,txBytes=0,rxBytes=0,txRateAt=0,rxRateAt=0,txBytesPrev=0,rxBytesPrev=0,maxTxLag=0,rxMaxGap=0;
let cameraStream=null,browserTestRunning=false;
const preview=$('preview').getContext('2d',{alpha:false,willReadFrequently:false}),display=$('received').getContext('2d',{alpha:false});
const sourceCanvas=document.createElement('canvas');sourceCanvas.width=C.W;sourceCanvas.height=C.H;const sourceCtx=sourceCanvas.getContext('2d',{willReadFrequently:true});
function log(message){const d=new Date().toLocaleTimeString('en-GB',{hour12:false});$('log').textContent=($('log').textContent+`[${d}] ${message}\n`).split('\n').slice(-55).join('\n');$('log').scrollTop=$('log').scrollHeight;}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function imageRGBA(ctx,rgba){ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),C.W,C.H),0,0);}
function newPhotoId(){if(globalThis.crypto?.getRandomValues){const x=new Uint16Array(1);crypto.getRandomValues(x);return x[0];}return Math.floor(Math.random()*65536);}
function makeReceiver(){return new C.Receiver({mode,onImageChange:id=>{log('Transmitter changed image ID to '+id+'; accumulation'+(rx.autoResetOnId?' reset.':' retained (manual mode).'));},onFrame:info=>{log('V sync / complete image scan '+info.pass+' · image ID '+info.imageId);}});}
let rx=makeReceiver();
function updatePlan(){const p=C.getLayout(mode);$('frameTime').textContent=p.frameSeconds.toFixed(1)+' s';$('txInfo').textContent=`${p.frameSamples.toLocaleString('en-US')} PCM samples per sweep · ${p.rows.length} physical Y/U/V scanlines · ${p.segments.toLocaleString('en-US')} sector sync tags per sweep. Each picture is repeated without changing any pixel.`;
 if(sourcePixels)buildWave();else usePattern(false);
 rx.setMode(mode);rxLastIndex=null;drawRx();}
function buildWave(){if(!sourcePixels)return;const source=C.sourceFromRGBA(sourcePixels,mode);wave=C.writeWave(source,mode,photoId);wavePos=0;log(`Prepared ${mode.toUpperCase()} image · ${(wave.length/1000000).toFixed(2)} MB PCM · ${C.getLayout(mode).frameSeconds.toFixed(2)} seconds per pass · image ID ${photoId}.`);}
function drawSource(source){sourcePixels=new Uint8ClampedArray(source);imageRGBA(preview,sourcePixels);photoId=newPhotoId();buildWave();}
function usePattern(withLog=true){sourceType='pattern';if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}drawSource(C.patternRGBA());if(withLog)log('Test pattern loaded.');}
async function chooseFile(file){if(!file)return;if(session?.state==='tx'){status('Stop transmitting before changing pictures.',true);return;}
 try{
  const bitmap=await createImageBitmap(file);sourceCtx.fillStyle='#000';sourceCtx.fillRect(0,0,C.W,C.H);
  const ratio=Math.min(C.W/bitmap.width,C.H/bitmap.height),w=bitmap.width*ratio,h=bitmap.height*ratio;
  sourceCtx.drawImage(bitmap,(C.W-w)/2,(C.H-h)/2,w,h);bitmap.close();sourceType='image';drawSource(sourceCtx.getImageData(0,0,C.W,C.H).data);
  log('Image loaded: '+file.name+` (${Math.round(w)}×${Math.round(h)} fitted within 1024×768).`);
 }catch(e){status('Cannot open image: '+e.message,true);log('Image: '+e.message);}
}
async function captureCamera(){if(session?.state==='tx'){status('Stop TX before freezing a different image.',true);return;}
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Webcam permission requires a secure context; use http://localhost in Chrome/Edge.');
  if(cameraStream)cameraStream.getTracks().forEach(t=>t.stop());cameraStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:960}},audio:false});
  const video=$('cameraVideo');video.srcObject=cameraStream;await video.play();
  sourceCtx.fillStyle='black';sourceCtx.fillRect(0,0,C.W,C.H);sourceCtx.drawImage(video,0,0,C.W,C.H);
  sourceType='camera';drawSource(sourceCtx.getImageData(0,0,C.W,C.H).data);
  cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;video.srcObject=null;
  log('Webcam still frame frozen (will not change during TX).');
 }catch(e){status('Webcam: '+e.message,true);log('Webcam: '+e.message);}
}
function nextWave(count){const out=new Uint8Array(count);let done=0;if(!wave)throw Error('No image waveform prepared');
 while(done<count){const n=Math.min(count-done,wave.length-wavePos);out.set(wave.subarray(wavePos,wavePos+n),done);done+=n;wavePos+=n;if(wavePos===wave.length)wavePos=0;}
 return out;}
class ByteParser{
 constructor(onFrame,onLine,onReady){this.rest=new Uint8Array(0);this.onFrame=onFrame;this.onLine=onLine;this.onReady=onReady;}
 feed(chunk){let data;if(this.rest.length){data=new Uint8Array(this.rest.length+chunk.length);data.set(this.rest);data.set(chunk,this.rest.length);}else data=chunk;
  let at=0;
  while(at<data.length){const v=data[at];
   if(v===77){const count=Math.min(4,data.length-at);let good=true;for(let i=1;i<count;i++)if(data[at+i]!==PREFIX[i])good=false;
    if(good){if(data.length-at<138)break;
     const view=new DataView(data.buffer,data.byteOffset+at,138),index=view.getUint32(4,true),strength=view.getUint16(8,true);
     this.onFrame(index,strength,data.subarray(at+10,at+138));at+=138;continue;}}
   if(v===0xef){if(data.length-at<4)break;if(data[at+1]===0xef&&data[at+2]===0xef&&data[at+3]===0xef){this.onReady();at+=4;continue;}}
   if(v===79||v===69){const expected=v===79?[79,75,32]:[69,82,82,32],count=Math.min(expected.length,data.length-at);let good=true;for(let i=1;i<count;i++)if(data[at+i]!==expected[i])good=false;
    if(good){if(data.length-at<expected.length)break;let end=at+expected.length,limit=Math.min(data.length,at+160);
     for(;end<limit&&data[end]!==10&&data[end]!==13;end++)if(data[end]<32||data[end]>126)break;
     if(end===data.length)break;
     if(data[end]===10||data[end]===13){this.onLine(new TextDecoder().decode(data.subarray(at,end)));at=end+1+(data[end]===13&&data[end+1]===10?1:0);continue;}}
   }
   at++;
  }
  this.rest=data.slice(at);if(this.rest.length>4096)this.rest=new Uint8Array(0);
 }
}
function rxPacket(index,strength,data){if(!session||session.state!=='rx')return;
 lastPacketAt=performance.now();rxBytes+=data.length;
 if(rxLastIndex!==null){const diff=(index-rxLastIndex)>>>0;
  if(diff>0&&diff<C.FS*15){rxMaxGap=Math.max(rxMaxGap,diff);rx.feedGap(diff);}
  else if(diff>=C.FS*15){rx.resetStream();log('Large MPX3 time-index discontinuity; keeping accumulated image.');}
 }
 rx.feedBytes(data);rxLastIndex=(index+data.length)>>>0;
}
function onLine(line){log(line);
 for(const p of [...pending])if(p.test(line)){pending=pending.filter(x=>x!==p);clearTimeout(p.timer);p.resolve(line);}
 if(/^ERR /.test(line)){for(const p of pending){clearTimeout(p.timer);p.reject(Error(line));}pending=[];if(session?.state==='tx'){session.txRunning=false;session.state='rx';status('RF fault: '+line,true);buttons();}}
}
function onReady(){if(session?.state==='keying'){session.ready?.();session.ready=null;}}
function waitLine(test,timeout=5000){return new Promise((resolve,reject)=>{const p={test,resolve,reject,timer:0};p.timer=setTimeout(()=>{pending=pending.filter(x=>x!==p);reject(Error('Serial reply timed out'));},timeout);pending.push(p);});}
async function write(bytes,own=session){if(!own||own.closing)throw Error('Port disconnected');await own.writer.write(typeof bytes==='string'?enc.encode(bytes):bytes);}
async function commandReply(command,test,timeout,own=session){const p=waitLine(test,timeout);await write(command,own);return p;}
async function serialRead(own){const parser=new ByteParser(rxPacket,onLine,onReady);try{
  while(session===own&&!own.closing){const reader=own.port.readable.getReader();own.reader=reader;
   try{while(session===own&&!own.closing){const {value,done}=await reader.read();if(done)return;if(value?.length)parser.feed(value);}}
   finally{reader.releaseLock();own.reader=null;}
  }
 }catch(e){if(!own.closing){log('Serial read failure: '+e.message);status('RX serial failed: '+e.message,true);}}
}
function rfConfig(){const hz=Math.round(Number($('frequency').value)*1e6),fine=Number($('fine').value),apwr=Number($('apwr').value);
 if(!Number.isSafeInteger(hz)||hz<2401000000||hz>2482500000)throw Error('RF frequency must be 2401–2482.5 MHz');
 if(!Number.isInteger(fine)||Math.abs(fine)>50000)throw Error('RX correction must be within ±50 kHz');
 if(!Number.isInteger(apwr)||apwr<0||apwr>191)throw Error('APWR must be 0–191');return {hz,fine,apwr};
}
function buttons(){const state=session?.state||'off',active=state!=='off'&&state!=='connecting';$('connect').disabled=state!=='off';$('disconnect').disabled=!active;
 $('startTx').disabled=state!=='rx'||$('role').value!=='tx';$('stopTx').disabled=!['tx','keying','stopping'].includes(state);
 $('role').disabled=state!=='off';$('mode').disabled=active;$('frequency').disabled=active;$('apwr').disabled=active;$('fine').disabled=active;
 for(const id of ['pickPhoto','webcam','pattern'])$(id).disabled=['tx','keying','stopping'].includes(state);
}
async function connect(){if(session)return;let own=null;try{
 const cfg=rfConfig();if(!navigator.serial)throw Error('Web Serial unavailable. Use desktop Chrome/Edge or localhost.');
 const port=await navigator.serial.requestPort();await port.open({baudRate:1500000,dataBits:8,stopBits:1,parity:'none',flowControl:'none',bufferSize:65536});
 own={port,writer:port.writable.getWriter(),reader:null,state:'connecting',closing:false,txRunning:false,txTask:null,ready:null};session=own;own.readTask=serialRead(own);buttons();status('Checking original CB FM STEREO V12...');await sleep(280);
 let okay=false;for(let tries=0;tries<3;tries++){try{await commandReply('STATUS\n',s=>/^OK STATUS CB_FM_STEREO 4$/.test(s),2300,own);okay=true;break;}
 catch(e){if(tries===2||/^ERR /.test(e.message))throw e;await sleep(350);}}
 if(!okay)throw Error('Original V12 firmware not recognized.');await commandReply('STOP\n',s=>s==='OK STOP',4000,own);
 const reply=await commandReply(`RX ${cfg.hz} HQ ${cfg.fine}\n`,s=>/^OK RX \d+ 120000 HQ$/.test(s),6500,own);log('Original V12 radio ready: '+reply);
 rx.resetStream();rxLastIndex=null;lastPacketAt=performance.now();rxMaxGap=0;own.state='rx';buttons();status($('role').value==='rx'?'Analog receiver running. Waiting for repeated photo and sync markers.':'Ready to transmit the stored photo continuously.');
 }catch(e){const message='Connection: '+e.message;log(message);if(own&&session===own)await disconnect();status(message,true);}}
async function disconnect(){const own=session;if(!own||own.closing)return;own.closing=true;own.txRunning=false;
 for(const p of pending){clearTimeout(p.timer);p.reject(Error('Disconnected'));}pending=[];
 if(['tx','keying'].includes(own.state))await sleep(150);session=null;
 try{await own.reader?.cancel();}catch(_e){}try{await own.readTask;}catch(_e){}
 try{own.writer.releaseLock();}catch(_e){}try{await own.port.close();}catch(_e){}
 buttons();status('Disconnected. Accumulated image is retained.');log('USB serial disconnected.');
}
async function txLoop(own){try{
 txBytes=0;txBytesPrev=0;txRateAt=performance.now();maxTxLag=0;wavePos=0;
 // V12 buffers 16 KiB; preload 12 KiB before starting steady pacing.
 await write(nextWave(PREBUFFER),own);txBytes+=PREBUFFER;
 const epoch=performance.now();let sent=0;
 while(session===own&&own.txRunning&&!own.closing){
  const deadline=epoch+sent*1000/C.FS,wait=deadline-performance.now();if(wait>1)await sleep(Math.min(wait,50));
  if(session!==own||!own.txRunning)break;
  const late=performance.now()-deadline;if(late>maxTxLag)maxTxLag=Math.round(late);
  if(late>100)log('Warning: delayed USB feed. The V12 TX ring may underflow; extra sync markers cannot recover omitted data.');
  await write(nextWave(BLOCK),own);sent+=BLOCK;txBytes+=BLOCK;
 }
 }catch(e){if(session===own&&!own.closing){status('TX failed: '+e.message,true);log('TX failed: '+e.message);}}
 finally{if(session===own){own.txRunning=false;if(own.state==='tx'){own.state='stopping';buttons();await sleep(350);if(session===own){own.state='rx';buttons();status('TX stopped. Radio returned to HQ RX.');}}}}
}
async function startTx(){const own=session;if(!own||own.state!=='rx'||$('role').value!=='tx')return;
 try{if(!wave)buildWave();const cfg=rfConfig();own.state='keying';buttons();status('Starting RF transmission…');
  const readyP=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{own.ready=null;reject(Error('RF READY signal not received'));},4000);own.ready=()=>{clearTimeout(timer);resolve();};});
  await write(`TX ${cfg.apwr}\n`,own);await readyP;
  if(session!==own||own.closing||own.state!=='keying')return;
  own.state='tx';own.txRunning=true;buttons();status('Repeating the same image continuously, with H/sector/V markers.');log('TX start: '+mode+', image ID '+photoId+', period '+C.getLayout(mode).frameSeconds.toFixed(2)+' s.');own.txTask=txLoop(own);
 }catch(e){if(session===own){own.state='rx';own.txRunning=false;own.ready=null;buttons();status('Cannot start TX: '+e.message,true);log('TX: '+e.message);}}}
async function stopTx(){const own=session;if(!own||!['tx','keying','stopping'].includes(own.state))return;own.txRunning=false;if(own.txTask)await own.txTask;
 if(session===own&&own.state==='keying'){own.state='stopping';buttons();await sleep(350);if(session===own){own.state='rx';buttons();}}}
function drawRx(){if(!rx)return;const current=rx.compose($('showMode').value,Number($('brightness').value),Number($('contrast').value),Number($('saturation').value));imageRGBA(display,current);
 $('rxLabel').textContent=$('showMode').value==='average'?'RX · ACCUMULATED':'RX · LATEST OBSERVATIONS';
 $('rxInfo').textContent=`${rx.imageFrames} complete-image marker(s), ${rx.hTagsGood} tagged H lines, ${rx.sectionTagsGood} correctly positioned 64-pixel sectors. Only validly positioned observations contribute to the mean.`;
}
function stats(){const now=performance.now();
 $('txRate').textContent=((txBytes-txBytesPrev)/Math.max(.2,(now-(txRateAt||now-1000))/1000)/1000).toFixed(1);txRateAt=now;txBytesPrev=txBytes;
 $('rxRate').textContent=((rxBytes-rxBytesPrev)/Math.max(.2,(now-(rxRateAt||now-1000))/1000)/1000).toFixed(1);rxRateAt=now;rxBytesPrev=rxBytes;
 $('rxH').textContent=rx.hTagsGood.toLocaleString('en-US');$('rxS').textContent=rx.sectionTagsGood.toLocaleString('en-US');$('rxV').textContent=rx.vHits.toLocaleString('en-US');$('passes').textContent=rx.imageFrames.toLocaleString('en-US');
 $('accPixels').textContent=rx.acceptedPixels.toLocaleString('en-US');$('rejectBlocks').textContent=rx.rejectedSectors.toLocaleString('en-US');$('gapCount').textContent=rx.missing.toLocaleString('en-US');
 $('diag').textContent=`H seen ${rx.hHits} / tagged ${rx.hTagsGood} / invalid IDs ${rx.hTagsBad} · segments tagged ${rx.sectionTagsGood} / rejected ${rx.sectionTagsBad} · valid V ${rx.imageFrames} · ignored pixel observations ${rx.rejectedPixels} · MPX3 max gap ${rxMaxGap} samples · TX max schedule lateness ${maxTxLag} ms · last image ID ${rx.lastImageId??'?'}${rx.formatMismatch!==undefined&&rx.formatMismatch!==null?' · WARNING: TX color mode differs from RX selection':''}`;
 if(session?.state==='rx'&&$('role').value==='rx'&&lastPacketAt&&now-lastPacketAt>2000){$('rxInfo').textContent='No new PCM radio samples; preserving the accumulated image.';}
 drawRx();
}
async function localTest(){if(browserTestRunning||session?.state==='tx')return;browserTestRunning=true;$('loopTest').disabled=true;
 try{
  log('Local analog test: first 16 lines + V marker, with gain/offset/noise. No RF equipment is used.');
  const tmp=new C.Receiver({mode}),src=C.sourceFromRGBA(C.patternRGBA(),mode),w=C.writeWave(src,mode,222);
  const len=C.V_HEADER+(C.H_HEADER+(16*C.SECTOR_SAMPLES))*16;
  const srcRand=(function(){let x=0x12345678;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};})();
  for(let i=0;i<len;i+=512){const take=Math.min(512,len-i),arr=new Uint8Array(take);
   for(let j=0;j<take;j++){let v=(w[i+j]<<24)>>24;v=Math.round(.8*v+8+(srcRand()-.5)*13);arr[j]=Math.max(-127,Math.min(127,v))&255;}
   tmp.feedBytes(arr);if(i%8192===0)await sleep(0);
  }
  const old=rx;rx=tmp;drawRx();log(`Local simulated channel: H=${tmp.hTagsGood} sectors=${tmp.sectionTagsGood} V=${tmp.imageFrames} placed pixels=${tmp.acceptedPixels}.`);
  await sleep(1700);rx=old;drawRx();
 }catch(e){log('Local test failed: '+e.message);status('Local test failed: '+e.message,true);}
 finally{browserTestRunning=false;$('loopTest').disabled=false;}
}
function updateSettings(){rx.rejection=Number($('rejection').value);rx.pauseAverage=!$('accumulate').checked;rx.autoResetOnId=$('autoImage').checked;
 for(const key of ['rejection','brightness','contrast','saturation'])$(key+'Out').textContent=$ (key).value+(key==='contrast'||key==='saturation'?'×':'');}
async function save(){const pixels=rx.compose('average',Number($('brightness').value),Number($('contrast').value),Number($('saturation').value));const canvas=document.createElement('canvas');canvas.width=C.W;canvas.height=C.H;canvas.getContext('2d').putImageData(new ImageData(pixels,C.W,C.H),0,0);
 canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='CB_IMAGE_1024_accumulated.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
}
function init(){for(const m of C.formats){const opt=document.createElement('option');opt.value=m.id;opt.textContent=m.label+` · ${C.getLayout(m.id).frameSeconds.toFixed(1)} s/pass`;$('mode').append(opt);} $('mode').value=mode;usePattern(false);updatePlan();buttons();updateSettings();drawRx();
 $('role').addEventListener('change',buttons);
 $('mode').addEventListener('change',()=>{if(session){status('Disconnect before changing video format.',true);$('mode').value=mode;return;}mode=$('mode').value;updatePlan();});
 $('connect').addEventListener('click',connect);$('disconnect').addEventListener('click',disconnect);
 $('pickPhoto').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',()=>{void chooseFile($('fileInput').files?.[0]);});
 $('webcam').addEventListener('click',captureCamera);$('pattern').addEventListener('click',()=>usePattern());
 $('startTx').addEventListener('click',startTx);$('stopTx').addEventListener('click',stopTx);
 $('savePNG').addEventListener('click',save);$('resetAverage').addEventListener('click',()=>{rx.clearAccumulator();drawRx();log('Accumulated photo cleared.');});
 $('loopTest').addEventListener('click',()=>void localTest());
 for(const id of ['showMode','rejection','brightness','contrast','saturation','accumulate','autoImage'])$(id).addEventListener('input',()=>{updateSettings();drawRx();});
 // Keep receiver responsive while serial streams; no image is dropped for failing a pixel CRC.
 setInterval(stats,900);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.state==='tx'){log('TX tab hidden: stopping to avoid background timer throttling.');void stopTx();}});
 log('CB-IMAGE/1024 ready. H+absolute-line tag, every-64-pixel sector sync, repeated V+picture ID. No video CRC.');
}
init();
})();
