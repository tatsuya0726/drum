// Audio is enhancement only; all information also has a text equivalent.
export function speakText(text,environment,onUnavailable=()=>{}) {
  try {
    if(!environment.speechSynthesis||!environment.SpeechSynthesisUtterance)throw Error('Unavailable');
    environment.speechSynthesis.cancel();
    const utterance=new environment.SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.85;
    utterance.onerror=()=>onUnavailable();environment.speechSynthesis.speak(utterance);return true;
  }catch{onUnavailable();return false;}
}
export async function playEffect(kind,environment) {
  let context;
  try {
    const Audio=environment.AudioContext||environment.webkitAudioContext;if(!Audio)return false;
    context=new Audio();await context.resume();
    const o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=kind==='heal'?620:180;
    g.gain.setValueAtTime(.025,context.currentTime);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+.13);
    o.connect(g);g.connect(context.destination);o.onended=()=>Promise.resolve(context.close()).catch(()=>{});o.start();o.stop(context.currentTime+.14);return true;
  }catch{if(context)try{await context.close();}catch{}return false;}
}
