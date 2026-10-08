// One context per page. Sound never determines combat or learning outcomes.
import {speakText} from './audio.js';
export const MUSIC={town:{file:'town.mp3',gain:.6,loopStart:0},battle:{file:'battle.mp3',gain:.55,loopStart:7.5},boss:{file:'boss.mp3',gain:.45,loopStart:0}};
export const audioSettings=raw=>({sound:raw?.sound===true,bgmVolume:volume(raw?.bgmVolume,.35),seVolume:volume(raw?.seVolume,.55),bgmMuted:raw?.bgmMuted===true,seMuted:raw?.seMuted===true});
function volume(n,fallback){return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;}
// Short zero-boundary ramps remove codec-edge clicks without trimming the musical loop.
export function softenLoop(buffer,start=0){if(!buffer.getChannelData)return buffer;const count=Math.max(2,Math.round(buffer.sampleRate*.008)),at=Math.round(start*buffer.sampleRate);for(let channel=0;channel<buffer.numberOfChannels;channel++){const samples=buffer.getChannelData(channel);for(let i=0;i<count;i++){const gain=i/(count-1);samples[i]*=gain;if(at)samples[at+i]*=gain;samples[samples.length-1-i]*=gain;}}return buffer;}
export class AudioManager {
 constructor(env){this.env=env;this.settings=audioSettings();this.context=null;this.scene='town';this.paused=false;this.hidden=false;this.ducked=false;this.buffers=new Map();this.music=null;this.musicKey=null;this.generation=0;this.voices=new Set();this.error=false;}
 async unlock(){
  try{if(this.context?.state==='closed'){this.context=null;this.bgm=null;this.se=null;}if(!this.context){const C=this.env.AudioContext||this.env.webkitAudioContext;if(!C)return false;this.context=new C();await this.context.resume();this.bgm=this.context.createGain();this.se=this.context.createGain();this.bgm.connect(this.context.destination);this.se.connect(this.context.destination);}else await this.context.resume();this.error=false;this.apply();void this.sync();return true;}
  catch{this.error=true;if(this.context&&!this.bgm){try{await this.context.close();}catch{}this.context=null;}return false;}
 }
 configure(settings){const was=this.settings.sound;this.settings=audioSettings(settings);if(was&&!this.settings.sound)this.cancelSpeech();this.apply();void this.sync();}
 apply(){if(!this.context||!this.bgm)return;const t=this.context.currentTime,s=this.settings,enabled=s.sound&&!this.paused&&!this.hidden;this.bgm.gain.setTargetAtTime(enabled&&!s.bgmMuted?s.bgmVolume*(this.ducked?.17:1):0,t,.08);this.se.gain.setTargetAtTime(enabled&&!s.seMuted?s.seVolume*(this.ducked?.35:1):0,t,.02);}
 setScene(scene){if(this.scene!==scene){this.scene=scene;this.stopMusic();}void this.sync();}
 setPaused(value){if(this.paused===value)return;this.paused=value;this.lifecycle();}
 setHidden(value){if(this.hidden===value)return;this.hidden=value;this.lifecycle();}
 lifecycle(){this.apply();if(this.paused||this.hidden){this.stopMusic();this.cancelSpeech();if(this.context)void Promise.resolve(this.context.suspend()).catch(()=>{});}else if(this.context&&this.settings.sound){void this.unlock();}}
 stopMusic(){this.generation++;if(this.music){try{this.music.stop();}catch{}this.music.disconnect();}this.music=null;this.musicKey=null;}
 async load(file){if(!this.buffers.has(file)){const p=(async()=>{const response=await this.env.fetch(new URL('./assets/audio/'+file,import.meta.url));if(!response.ok)throw Error('Audio download failed');const buffer=await this.context.decodeAudioData(await response.arrayBuffer());return softenLoop(buffer,Object.values(MUSIC).find(x=>x.file===file)?.loopStart||0);})();this.buffers.set(file,p);p.catch(()=>this.buffers.delete(file));}return this.buffers.get(file);}
 async sync(){
  const definition=MUSIC[this.scene];if(!this.context||!this.bgm||this.context.state!=='running'||!this.settings.sound||this.settings.bgmMuted||this.paused||this.hidden||!definition){if(this.musicKey)this.stopMusic();return;}
  if(this.musicKey===this.scene)return;const key=this.scene,token=++this.generation;this.musicKey=key;
  try{const buffer=await this.load(definition.file);if(token!==this.generation)return;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.loop=true;source.loopStart=definition.loopStart;source.loopEnd=buffer.duration;gain.gain.value=definition.gain;source.connect(gain);gain.connect(this.bgm);source.onended=()=>gain.disconnect();this.music=source;source.start();}
  catch{if(token===this.generation){this.musicKey=null;this.error=true;}}
 }
 tone(frequency,start,length,type='sine',strength=.13,end=frequency){const c=this.context,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(frequency,start);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+length);g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(strength,start+.008);g.gain.exponentialRampToValueAtTime(.0001,start+length);o.connect(g);g.connect(this.se);this.voices.add(o);o.onended=()=>{this.voices.delete(o);g.disconnect();};o.start(start);o.stop(start+length+.01);}
 async effect(kind){
  if(!this.settings.sound||this.settings.seMuted||this.paused||this.hidden||!this.context||this.context.state!=='running'||this.voices.size>16)return false;
  try{const t=this.context.currentTime; // Original short motifs; no copied melodies.
   if(kind==='heal'){[523.25,659.25,783.99].forEach((f,i)=>this.tone(f,t+i*.07,.3,'sine',.11));}
   else if(kind==='victory'){[523.25,659.25,783.99,1046.5].forEach((f,i)=>this.tone(f,t+i*.13,.25,'triangle',.14));}
   else if(['blast','magic','song','mark','silence','status'].includes(kind)){this.tone(330,t,.3,'triangle',.12,1320);this.tone(660,t+.04,.22,'sine',.09,440);}
   else if(['guard','shield','protect'].includes(kind)){this.tone(440,t,.17,'sine',.13);this.tone(880,t+.03,.2,'sine',.07);}
   else if(['defeat','hit','poison'].includes(kind)){this.tone(110,t,.16,'triangle',.2,38);}
   else {this.tone(320,t,.12,'sawtooth',.055,70);}
   return true;
  }catch{this.error=true;return false;}
 }
 cancelSpeech(){this.speechToken=(this.speechToken||0)+1;try{this.env.speechSynthesis?.cancel();}catch{}clearTimeout(this.speechTimer);this.ducked=false;this.apply();}
 speak(text,onUnavailable=()=>{}){this.cancelSpeech();if(!this.settings.sound||this.hidden||this.paused)return false;const token=this.speechToken;this.ducked=true;this.apply();const finish=()=>{if(token!==this.speechToken)return;clearTimeout(this.speechTimer);this.ducked=false;this.apply();};this.speechTimer=setTimeout(finish,Math.max(12000,text.length*150));return speakText(text,this.env,()=>{finish();onUnavailable();},finish);}
 dispose(){this.stopMusic();this.cancelSpeech();for(const v of this.voices)try{v.stop();}catch{}if(this.context)void Promise.resolve(this.context.close()).catch(()=>{});}
}
