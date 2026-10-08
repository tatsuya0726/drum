// Audio is enhancement only; all information also has a text equivalent.
export function speakText(text,environment,onUnavailable=()=>{},onFinished=()=>{}) {
  try {
    if(!environment.speechSynthesis||!environment.SpeechSynthesisUtterance)throw Error('Unavailable');
    environment.speechSynthesis.cancel();
    const utterance=new environment.SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.85;
    utterance.onend=onFinished;utterance.onerror=()=>{onFinished();onUnavailable();};environment.speechSynthesis.speak(utterance);return true;
  }catch{onFinished();onUnavailable();return false;}
}
const managers=new WeakMap();
export async function playEffect(kind,environment) {
  const {AudioManager}=await import('./audio-manager.js');
  if(!managers.has(environment))managers.set(environment,new AudioManager(environment));
  const manager=managers.get(environment);manager.configure({sound:true,bgmMuted:true});
  return await manager.unlock()?manager.effect(kind):false;
}
