/* CB-IMAGE/1024 - repeated analog PCM8 still-image television.
 * ESP8266 CB FM STEREO V12 firmware is unmodified. No CRC/FEC on pixels.
 * H marker + absolute 2-bit plane / 10-bit row tag per physical line;
 * sector marker + 4-bit column tag every 64 pixels; V marker per image.
 * Markers and their small check bits are out of the visible image area.
 */
(function(root){
'use strict';
const FS=120000, W=1024, H=768, SECTOR_PIXELS=64, SPP=2;
const LOW=-118, HIGH=118, TAG_LOW=-104, TAG_HIGH=104, BLACK=-76, WHITE=76;
const PX_MIN=-64,PX_MAX=64, INVALID=-128;
const H_PRE=72,H_BIT=6,H_TAG_BITS=16,H_REF=24,H_HEADER=H_PRE+H_TAG_BITS*H_BIT+H_REF;
const S_PRE=24,S_BIT=6,S_TAG_BITS=6,S_PAD=8,S_HEADER=S_PRE+S_TAG_BITS*S_BIT+S_PAD;
const V_PRE=216,V_BIT=8,V_TAG_BITS=24,V_PAD=24,V_HEADER=V_PRE+V_TAG_BITS*V_BIT+V_PAD;
const SECTOR_SAMPLES=S_HEADER+SECTOR_PIXELS*SPP;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),b8=(x)=>(x+256)&255;
const formats=Object.freeze([
 {id:'444',label:'1024×768 · YUV 4:4:4 · full-resolution color · 2 samples/pixel',code:2,uvScale:1},
 {id:'420',label:'1024×768 · YUV 4:2:0 · faster color · 2 samples/value',code:1,uvScale:2},
 {id:'gray',label:'1024×768 · monochrome · 2 samples/pixel',code:0,uvScale:0}
]);
function fmt(id){const f=formats.find(x=>x.id===id);if(!f)throw Error('Unknown format '+id);return f;}
function checksum4(data){let x=data ^(data>>>4)^(data>>>8);x^=x>>>2;return x&15;}
function checksum2(data){return ((data^ (data>>>2) ^ (data>>>1) ^ 1)&3);}
function checksum6(data){let c=0x2D;for(let b=17;b>=0;b--){const bit=(data>>>b)&1,carry=(c>>>5)&1;c=((c<<1)&63)^((carry^bit)?0x27:0);}return c;}
function lineWord(plane,row){const payload=(plane<<10)|row;return (payload<<4)|checksum4(payload);}
function validLineWord(word){const p=word>>>4;return checksum4(p)===(word&15)?{plane:p>>>10,row:p&1023}:null;}
function sectionWord(index){return (index<<2)|checksum2(index);}
function validSectionWord(word){const index=word>>>2;return index<16&&checksum2(index)===(word&3)?index:null;}
function frameWord(id,modeCode){const d=((id&65535)<<2)|(modeCode&3);return d*64+checksum6(d);}
function validFrameWord(word){const d=word>>>6;return checksum6(d)===(word&63)?{imageId:d>>>2,mode:d&3}:null;}
function layout(mode){const f=fmt(mode),rows=[];let sampleOffset=V_HEADER;
 const planes=f.id==='gray'?[['y',W,H]]:f.id==='444'?[['y',W,H],['u',W,H],['v',W,H]]:[['y',W,H],['u',W/2,H/2],['v',W/2,H/2]];
 for(const [name,width,height] of planes)for(let row=0;row<height;row++){
  const len=H_HEADER+width/SECTOR_PIXELS*SECTOR_SAMPLES;
  rows.push({plane:name,planeCode:name==='y'?0:name==='u'?1:2,row,width,len,offset:sampleOffset});sampleOffset+=len;
 }
 return {format:f,rows,frameSamples:sampleOffset,frameSeconds:sampleOffset/FS,segments:rows.reduce((s,r)=>s+r.width/SECTOR_PIXELS,0)};
}
const layouts=Object.fromEntries(formats.map(f=>[f.id,layout(f.id)]));
function getLayout(mode){return layouts[mode];}
function sourceFromRGBA(rgba,mode){const f=fmt(mode);if(rgba.length!==W*H*4)throw Error('Source image must be RGBA 1024×768');
 const y=new Uint8Array(W*H),uvW=f.uvScale===2?W/2:W,uvH=f.uvScale===2?H/2:H;
 const u=f.uvScale?new Uint8Array(uvW*uvH):null,v=f.uvScale?new Uint8Array(uvW*uvH):null;
 // Full range YUV BT.601-style, 8-bit input components; analog on-air
 // pixel voltage uses a narrower reserved range for robust sync pulses.
 for(let p=0;p<W*H;p++){
  const j=p*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2],yy=.299*r+.587*g+.114*b;
  y[p]=clamp(Math.round(yy),0,255);
  if(f.uvScale===1){u[p]=clamp(Math.round((b-yy)/1.772+128),0,255);v[p]=clamp(Math.round((r-yy)/1.402+128),0,255);}
 }
 if(f.uvScale===2)for(let row=0;row<H;row+=2)for(let col=0;col<W;col+=2){
  let su=0,sv=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const p=(row+dy)*W+col+dx,j=p*4,yy=y[p];su+=(rgba[j+2]-yy)/1.772+128;sv+=(rgba[j]-yy)/1.402+128;
  }
  const pos=(row/2)*(W/2)+col/2;u[pos]=clamp(Math.round(su/4),0,255);v[pos]=clamp(Math.round(sv/4),0,255);
 }
 return {mode,y,u,v};
}
function patternRGBA(){const out=new Uint8ClampedArray(W*H*4);
 for(let row=0;row<H;row++)for(let x=0;x<W;x++){
  const j=4*(row*W+x),sq=((x/64|0)+(row/64|0))&1;
  let r=sq?205:44,g=r,b=r;
  if(x>W*.24&&x<W*.74&&row>H*.25&&row<H*.72){r=g=b=Math.round(255*(x/W-.24)/.5);}
  if(row>H*.84){const k=Math.min(5,x*6/W|0);[r,g,b]=[[225,53,53],[232,173,51],[49,195,109],[42,151,220],[157,85,213],[224,92,169]][k];}
  if((x-512)**2+(row-380)**2<130**2){const v=128+120*Math.sin((x-512)*.047);r=clamp(Math.round(v),0,255);g=r;b=r;}
  out[j]=r;out[j+1]=g;out[j+2]=b;out[j+3]=255;
 }
 return out;
}
function encodeBits(dst,at,word,bits,nsamples){for(let i=bits-1;i>=0;i--){dst.fill(b8(((word>>>i)&1)?TAG_HIGH:TAG_LOW),at,at+nsamples);at+=nsamples;}return at;}
function writeWave(source,mode,imageId){const p=getLayout(mode),dst=new Uint8Array(p.frameSamples);if(!source||source.mode!==mode)throw Error('Mode/source mismatch');let at=0;
 const put=(v,n)=>{dst.fill(b8(v),at,at+n);at+=n;};
 // Unique vertical sync waveform: three long LOW plateaus alternating with HIGH.
 for(let k=0;k<3;k++){put(LOW,48);put(HIGH,24);}
 at=encodeBits(dst,at,frameWord(imageId,p.format.code),V_TAG_BITS,V_BIT);put(BLACK,V_PAD);
 for(const row of p.rows){
  for(let k=0;k<3;k++){put(LOW,12);put(HIGH,12);}
  at=encodeBits(dst,at,lineWord(row.planeCode,row.row),H_TAG_BITS,H_BIT);
  put(BLACK,12);put(WHITE,12);
  const data=source[row.plane];if(!data)throw Error('Missing color plane '+row.plane);
  for(let s=0;s<row.width/64;s++){
   put(LOW,8);put(HIGH,8);put(LOW,8);
   at=encodeBits(dst,at,sectionWord(s),S_TAG_BITS,S_BIT);put(BLACK,S_PAD);
   for(let x=0;x<64;x++){
    const q=data[row.row*row.width+s*64+x],target=PX_MIN+(PX_MAX-PX_MIN)*q/255;
    // Two neighboring PCM values represent an average in half-level steps.
    // This preserves ~8-bit tonal granularity despite reserved sync headroom.
    const first=Math.floor(target),second=Math.round(target*2-first);
    put(first,1);put(second,1);
   }
  }
 }
 if(at!==dst.length)throw Error('Waveform length mismatch: '+at+' != '+dst.length);
 return dst;
}
// Streaming marker separator and analog image accumulator.
// Only synchronization/position tags are checked. Video samples are never
// CRC-protected; individual observations can be ignored for averaging.
class Receiver{
 constructor({mode='444',onUpdate=()=>{},onImageChange=()=>{},onFrame=()=>{}}={}){
  this.onUpdate=onUpdate;this.onImageChange=onImageChange;this.onFrame=onFrame;this.rejection=76;this.pauseAverage=false;this.autoResetOnId=true;
  this.maxOffset=13;this._allocate(mode);
 }
 _allocate(mode){this.mode=mode;this.p=getLayout(mode);this.f=this.p.format;this.yW=W;this.uvW=this.f.uvScale===2?W/2:W;
  this.avg={y:new Float32Array(W*H),u:this.f.uvScale?new Float32Array((W/this.f.uvScale)*(H/this.f.uvScale)):null,v:this.f.uvScale?new Float32Array((W/this.f.uvScale)*(H/this.f.uvScale)):null};
  this.count={y:new Uint16Array(W*H),u:this.f.uvScale?new Uint16Array(this.avg.u.length):null,v:this.f.uvScale?new Uint16Array(this.avg.v.length):null};
  this.latest={y:new Uint8Array(W*H),u:this.f.uvScale?new Uint8Array(this.avg.u.length):null,v:this.f.uvScale?new Uint8Array(this.avg.v.length):null};
  this.clearAccumulator();this.resetStream();
 }
 setMode(mode){if(mode!==this.mode)this._allocate(mode);}
 clearAccumulator(){for(const name of ['y','u','v']){if(!this.avg[name])continue;this.avg[name].fill(name==='y'?95:128);this.latest[name].fill(name==='y'?95:128);this.count[name].fill(0);}this.acceptedPixels=0;this.rejectedPixels=0;this.acceptedSectors=0;this.rejectedSectors=0;this.acceptedLines=0;this.imageFrames=0;this.lastImageId=null;this.rawReceived=0;}
 resetStream(){this.raw=new Int16Array(16384);this.mask=16383;this.index=0;this.lastH=-1e9;this.lastV=-1e9;this.hHits=0;this.vHits=0;this.hTagsGood=0;this.hTagsBad=0;this.sectionTagsGood=0;this.sectionTagsBad=0;this.falseMarkers=0;this.missing=0;this.pendingH=null;this.pendingV=null;this.activeLine=null;this.lastGain=1;this.lastOffset=0;}
 at(idx){return idx<0||idx>=this.index||idx<this.index-this.raw.length?INVALID:this.raw[idx&this.mask];}
 // Return normalized score. The input can be attenuated or DC-shifted.
 scorePattern(start,sections,minContrast){
  if(start<0||start+sections.reduce((s,v)=>s+v[1],0)>this.index)return null;
  let lo=0,hi=0,nlo=0,nhi=0,variance=0,means=[];
  let at=start;
  for(const [isHigh,len] of sections){
   const trim=len>=24?3:len>=12?2:1;let sum=0,sq=0,n=0;
   for(let i=trim;i<len-trim;i++){const v=this.at(at+i);if(v===INVALID)continue;sum+=v;sq+=v*v;n++;}
   if(n<(len-2*trim)*.70)return null;
   const m=sum/n,sd=Math.sqrt(Math.max(0,sq/n-m*m));means.push({m,sd,isHigh});variance+=sd;
   if(isHigh){hi+=m;nhi++;}else{lo+=m;nlo++;}
   at+=len;
  }
  lo/=nlo;hi/=nhi;const diff=hi-lo;
  if(diff<minContrast)return null;
  const maxSD=Math.max(23,diff*.18);
  if(means.some(x=>x.sd>maxSD))return null;
  if(means.some(x=>Math.abs(x.m-(x.isHigh?hi:lo))>Math.max(25,diff*.20)))return null;
  // A flat plateau can score equally at several adjacent sample offsets.
  // Use the signed transition edges to recover the exact start sample;
  // otherwise a 2-sample pixel would be shifted by a full pixel.
  let edgeSum=0,edges=0,pos=start+sections[0][1];
  for(let j=1;j<sections.length;j++){
   const before=this.at(pos-1),after=this.at(pos);
   if(before!==INVALID&&after!==INVALID){edgeSum+=(sections[j][0]?1:-1)*(after-before);edges++;}
   pos+=sections[j][1];
  }
  return {score:diff-variance*.3+(edges?edgeSum/edges*.7:0),low:lo,high:hi,diff};
 }
 scan(pat,len,offset,window,minContrast){const sections=pat;let best=null;
  const coarse=this.index-len-offset;
  const initial=this.scorePattern(coarse,sections,minContrast);
  if(!initial)return null;
  // Refine sample-accurate phase. Crucial for 2-sample pixels.
  for(let dx=-window;dx<=window;dx++){
   const s=coarse+dx,v=this.scorePattern(s,sections,minContrast);
   if(v&&(!best||v.score>best.score))best={...v,start:s};
  }
  return best;
 }
 bits(start,bits,samples,low,high){const mid=(low+high)/2,margin=Math.max(13,Math.abs(high-low)*.15);let word=0;
  for(let b=0;b<bits;b++){
   let sum=0,n=0;
   for(let s=1;s<samples-1;s++){const v=this.at(start+b*samples+s);if(v!==INVALID){sum+=v;n++;}}
   if(n<Math.max(2,(samples-2)*.7))return null;
   const mean=sum/n;if(Math.abs(mean-mid)<margin)return null;
   word=word*2+(mean>mid?1:0);
  }
  return word;
 }
 _onH(start,low,high){if(start-this.lastH<300)return;this.lastH=start;this.hHits++;
  this.pendingH={start,low,high};
 }
 _finishH(){const h=this.pendingH;if(!h||this.index<h.start+H_HEADER+2)return;this.pendingH=null;
  const tag=this.bits(h.start+H_PRE,16,H_BIT,h.low,h.high),loc=tag===null?null:validLineWord(tag);
  if(!loc){this.hTagsBad++;return;}
  const pcode=loc.plane;
  const plane=['y','u','v'][pcode];if(!plane || (plane!=='y'&&this.f.uvScale===0)){this.hTagsBad++;return;}
  const width=plane==='y'?W:W/this.f.uvScale,height=plane==='y'?H:H/this.f.uvScale;
  if(loc.row>=height){this.hTagsBad++;return;}
  const bl=this.mean(h.start+H_PRE+16*H_BIT,12),wh=this.mean(h.start+H_PRE+16*H_BIT+12,12);
  if(bl===null||wh===null||wh-bl<40){this.hTagsBad++;return;}
  const gain=(wh-bl)/(WHITE-BLACK),offs=bl-BLACK*gain;
  if(gain<.27||gain>2.6){this.hTagsBad++;return;}
  this.hTagsGood++;this.lastGain=gain;this.lastOffset=offs;
  this.activeLine={start:h.start,plane,row:loc.row,width,nsectors:width/64,next:0,gain,offs,seen:0};
 }
 mean(start,len){let sum=0,n=0;for(let k=1;k<len-1;k++){const v=this.at(start+k);if(v!==INVALID){sum+=v;n++;}}return n>=Math.max(2,len*.55)?sum/n:null;}
 _onV(start,low,high){if(start-this.lastV<this.p.frameSamples*.45)return;this.lastV=start;this.vHits++;this.pendingV={start,low,high};}
 _finishV(){const v=this.pendingV;if(!v||this.index<v.start+V_HEADER+2)return;this.pendingV=null;
  const word=this.bits(v.start+V_PRE,24,V_BIT,v.low,v.high),data=word===null?null:validFrameWord(word);
  if(!data){this.falseMarkers++;return;}
  if(data.mode!==this.f.code){this.formatMismatch=data.mode;return;}
  this.formatMismatch=null;this.imageFrames++;
  if(this.lastImageId!==null && this.lastImageId!==data.imageId){if(this.autoResetOnId)this.clearAccumulator();this.imageFrames=1;this.onImageChange(data.imageId);}
  this.lastImageId=data.imageId;this.onFrame({imageId:data.imageId,pass:this.imageFrames});
 }
 _finishSector(){const line=this.activeLine;if(!line)return;
  while(line.next<line.nsectors){
   const s=line.next,guess=line.start+H_HEADER+s*SECTOR_SAMPLES;
   if(this.index<guess+SECTOR_SAMPLES+this.maxOffset+2)break;
   // Find a local sync peak near the nominal sector start (not at an arbitrary pixel).
   const pattern=[[false,8],[true,8],[false,8]];let best=null;
   for(let dx=-this.maxOffset;dx<=this.maxOffset;dx++){
    const start=guess+dx,z=this.scorePattern(start,pattern,59);
    if(z&&(!best||z.score>best.score))best={...z,start};
   }
   line.next++;
   if(!best){this.sectionTagsBad++;this.rejectedSectors++;continue;}
   const w=this.bits(best.start+S_PRE,S_TAG_BITS,S_BIT,best.low,best.high);
   if(w===null||validSectionWord(w)!==s){this.sectionTagsBad++;this.rejectedSectors++;continue;}
   this.sectionTagsGood++;
   const dataStart=best.start+S_HEADER,plane=line.plane,width=line.width,values=new Float32Array(64),valid=new Uint8Array(64);
   let missing=0,outliers=0,already=0;
   for(let i=0;i<64;i++){
    const a=this.at(dataStart+i*SPP),b=this.at(dataStart+i*SPP+1);
    if(a===INVALID||b===INVALID){missing++;continue;}
    const raw=(a+b)/2;
    const level=clamp((raw-line.offs-PX_MIN*line.gain)*255/((PX_MAX-PX_MIN)*line.gain),0,255);
    values[i]=level;valid[i]=1;
    const pos=line.row*width+s*64+i,count=this.count[plane][pos];
    if(count>=3){already++;if(Math.abs(level-this.avg[plane][pos])>this.rejection)outliers++;}
   }
   // Reject a grossly displaced/noisy sector; no CRC or digital pixel checks.
   if(missing>20||(already>=20&&outliers>already*.42)){this.rejectedSectors++;this.rejectedPixels+=64;continue;}
   const accumulator=this.avg[plane],counts=this.count[plane],latest=this.latest[plane];
   for(let i=0;i<64;i++){
    if(!valid[i]){this.rejectedPixels++;continue;}
    const pos=line.row*width+s*64+i,cur=counts[pos],x=values[i];latest[pos]=clamp(Math.round(x),0,255);this.rawReceived++;
    if(this.pauseAverage)continue;
    if(cur>=4&&Math.abs(x-accumulator[pos])>this.rejection){this.rejectedPixels++;continue;}
    counts[pos]=Math.min(60000,cur+1);accumulator[pos]+= (x-accumulator[pos])/counts[pos];this.acceptedPixels++;
   }
   line.seen++;this.acceptedSectors++;
  }
  if(line.next>=line.nsectors){if(line.seen)this.acceptedLines++;this.activeLine=null;this.onUpdate();}
 }
 feed(value){const i=this.index;this.raw[i&this.mask]=value;this.index++;if(value===INVALID)this.missing++;
  if((i&3)===0){
   const h=this.scan([[false,12],[true,12],[false,12],[true,12],[false,12],[true,12]],H_PRE,1,5,67);
   if(h)this._onH(h.start,h.low,h.high);
  }
  if((i&3)===0){
   const v=this.scan([[false,48],[true,24],[false,48],[true,24],[false,48],[true,24]],V_PRE,1,6,72);
   if(v)this._onV(v.start,v.low,v.high);
  }
  this._finishH();this._finishV();this._finishSector();
 }
 feedBytes(bytes){for(let i=0;i<bytes.length;i++)this.feed(bytes[i]===128?INVALID:(bytes[i]<<24)>>24);}
 feedGap(n){if(n<=0)return;
  this.missing+=n;
  if(n<4000){for(let i=0;i<n;i++)this.feed(INVALID);this.missing-=n;}
  else {this.index+=n;this.raw.fill(INVALID);this.pendingH=null;this.pendingV=null;this.activeLine=null;this.lastH=-1e9;this.lastV=-1e9;}
 }
 compose(which='average',brightness=0,contrast=1,saturation=1){const out=new Uint8ClampedArray(W*H*4),y=this[which==='raw'?'latest':'avg'].y;
  const uv=this[which==='raw'?'latest':'avg'],scale=this.f.uvScale,uw=this.uvW;
  for(let row=0;row<H;row++)for(let x=0;x<W;x++){
   const pos=row*W+x,j=pos*4,luma=y[pos];let r=luma,g=luma,b=luma;
   if(scale){const uindex=(row/scale|0)*uw+(x/scale|0),du=(uv.u[uindex]-128)*saturation,dv=(uv.v[uindex]-128)*saturation;
    r=luma+1.402*dv;g=luma-.344136*du-.714136*dv;b=luma+1.772*du;
   }
   out[j]=clamp((r-128)*contrast+128+brightness,0,255);
   out[j+1]=clamp((g-128)*contrast+128+brightness,0,255);
   out[j+2]=clamp((b-128)*contrast+128+brightness,0,255);out[j+3]=255;
  }
  return out;
 }
}
root.CBImage1024=Object.freeze({FS,W,H,SPP,SECTOR_PIXELS,H_PRE,H_HEADER,S_PRE,S_HEADER,V_PRE,V_HEADER,SECTOR_SAMPLES,
 LOW,HIGH,BLACK,WHITE,PX_MIN,PX_MAX,formats,fmt,getLayout,patternRGBA,sourceFromRGBA,writeWave,Receiver,
 checksum4,checksum2,checksum6,lineWord,validLineWord,sectionWord,validSectionWord,frameWord,validFrameWord});
})(typeof globalThis!=='undefined'?globalThis:this);
