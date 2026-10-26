/* util.js: small shared helpers and UI services that everything else may use (icons, escaping, busy indicator, toast).
   Depends on nothing else in the app. */
'use strict';
const P={
cboxo:"M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 16H5V5h14v14zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 3.99z",
download:"M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11z",
undo:"M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z",
redo:"M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z",
upload:"M9 16h6v-6h4l-7-7-7 7h4v6zm3-10.17L14.17 8H13v6h-2V8H9.83L12 5.83zM5 18h14v2H5z",
bold:"M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z",
italic:"M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z",
underline:"M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z",
camera:"M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm11 16H4V6h4.05l1.83-2h4.24l1.83 2H20v12zM12 7.3c-2.6 0-4.7 2.1-4.7 4.7s2.1 4.7 4.7 4.7 4.7-2.1 4.7-4.7-2.1-4.7-4.7-4.7zm0 1.5c1.77 0 3.2 1.43 3.2 3.2s-1.43 3.2-3.2 3.2-3.2-1.43-3.2-3.2 1.43-3.2 3.2-3.2z",
clearfmt:"M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.55 5.27 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z",
gear:"M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.09-.16-.26-.25-.44-.25-.06 0-.12.01-.17.03l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.06-.02-.12-.03-.18-.03-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.09.16.26.25.44.25.06 0 .12-.01.17-.03l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-1.98-1.71c.04.31.05.52.05.73 0 .21-.02.43-.05.73l-.14 1.13.89.7 1.08.84-.7 1.21-1.27-.51-1.04-.42-.9.68c-.43.32-.84.56-1.25.73l-1.06.43-.16 1.13-.2 1.35h-1.4l-.19-1.35-.16-1.13-1.06-.43c-.43-.18-.83-.41-1.23-.71l-.91-.7-1.06.43-1.27.51-.7-1.21 1.08-.84.89-.7-.14-1.13c-.03-.31-.05-.54-.05-.74s.02-.43.05-.73l.14-1.13-.89-.7-1.08-.84.7-1.21 1.27.51 1.04.42.9-.68c.43-.32.84-.56 1.25-.73l1.06-.43.16-1.13.2-1.35h1.39l.19 1.35.16 1.13 1.06.43c.43.18.83.41 1.23.71l.91.7 1.06-.43 1.27-.51.7 1.21-1.07.85-.89.7.14 1.13zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
attach:"M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z",
image:"M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z",
video:"M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
mic:"M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
link:"M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
label:"M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16zM16 17H5V7h11l3.55 5L16 17z",
edit:"M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z",
menu:"M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
search:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
pin:"M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z",
trash:"M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z",
palette:"M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm4 13h-1.77c-1.28 0-2.31 1.04-2.31 2.31 0 .45.18.9.5 1.23.23.23.35.54.35.85 0 .55-.45 1-1 1-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.14 8 7c0 2.21-1.79 4-4 4zM6.5 10c-.83 0-1.5.67-1.5 1.5S5.67 13 6.5 13 8 12.33 8 11.5 7.33 10 6.5 10zm3-4C8.67 6 8 6.67 8 7.5S8.67 9 9.5 9 11 8.33 11 7.5 10.33 6 9.5 6zm5 0c-.83 0-1.5.67-1.5 1.5S13.67 9 14.5 9 16 8.33 16 7.5 15.33 6 14.5 6zm3 4c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z",
cbx:"M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
cb0:"M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z",
note:"M19 3H4.99C3.89 3 3 3.9 3 5l.01 14c0 1.1.89 2 1.99 2h10l6-6V5c0-1.1-.9-2-2-2zM7 8h10v2H7V8zm5 6H7v-2h5v2zm2 5.5V14h5.5L14 19.5z",
grid:"M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z",
rows:"M20 13H3c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h17c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zm-1 6H4v-4h15v4zM20 3H3c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h17c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zm-1 6H4V5h15v4z",
restore:"M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
close:"M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
add:"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
prev:"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
next:"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
zin:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm2.5-4h-2v2H9v-2H7V9h2V7h1v2h2v1z",
folder:"M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
file:"M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z",
rotl:"M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z",
rotr:"M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z",
zout:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z",
};
/* Outline icons drawn with a 2px stroke (the encryption set), used with the same call as the others: ic('lockOn',24).
   lockOn / lockOff: a padlock, closed / open (the shackle is hinged on its right leg, which sits at x=10, and its free end is to the left).
   maskOn / maskOff: a domino mask, plain / with a slash through it. On = encryption on, Off = encryption off. */
const PS={
  lockOn:'<path d="M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/>',
  lockOff:'<path d="M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M10 10V6a4 4 0 0 0-8 0"/><path d="M12 15v2"/>',
  maskOn:'<path d="M2.5 8.5C6 6.5 9 7 12 8c3-1 6-1.5 9.5.5-.2 4.8-2.7 8-6 8-1.8 0-2.7-1.4-3.5-1.4S9.8 16.5 8 16.5c-3.3 0-5.3-3.2-5.5-8z"/><path d="M5.3 11.5a2.2 1.4 0 1 0 4.4 0a2.2 1.4 0 1 0-4.4 0z M14.3 11.5a2.2 1.4 0 1 0 4.4 0a2.2 1.4 0 1 0-4.4 0z"/>',
  maskOff:'<path d="M2.5 8.5C6 6.5 9 7 12 8c3-1 6-1.5 9.5.5-.2 4.8-2.7 8-6 8-1.8 0-2.7-1.4-3.5-1.4S9.8 16.5 8 16.5c-3.3 0-5.3-3.2-5.5-8z"/><path d="M5.3 11.5a2.2 1.4 0 1 0 4.4 0a2.2 1.4 0 1 0-4.4 0z M14.3 11.5a2.2 1.4 0 1 0 4.4 0a2.2 1.4 0 1 0-4.4 0z"/><path d="M3 3l18 18"/>'
};
const ic=(n,s=24)=>PS[n]?`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PS[n]}</svg>`:`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const $=s=>document.querySelector(s);
const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* Background work: the spinner is shown (by CSS) while this counter is above zero.
   A job that can say how far along it is also registers with busyProgress(total). While every running job does that,
   the equalizer spinner is replaced by a progress ring with the combined percentage; if any running job can't say, the spinner stays. */
let busyN=0,spinRaf=0;const busyProg=new Set();
function busyStart(){if(++busyN===1)document.body.classList.add('busy');spinUpdate()}
function busyEnd(){if(busyN>0&&--busyN===0)document.body.classList.remove('busy');spinUpdate()}
async function withBusy(fn){busyStart();try{return await fn()}finally{busyEnd()}}
function busyProgress(total){
  const t={done:0,total:Math.max(1,total)};busyProg.add(t);spinUpdate();
  return{
    set(done,tot){if(tot)t.total=Math.max(1,tot);t.done=Math.max(0,Math.min(t.total,done));spinUpdate()},
    end(){if(busyProg.delete(t))spinUpdate()}
  };
}
/* Which indicator shows, the ring or the spinner, is steadied so that it cannot flicker. The ring is chosen at once. Going back to the spinner waits until the ring
   has not been wanted for SPIN_HOLD ms in a row: a job that has started but not yet said how far along it is (a background save beginning in the middle of an import),
   or one that has just finished its progress but not its work, would otherwise flip the indicator back and forth. */
const SPIN_HOLD=900;let spinDet=false,spinFalseAt=0,spinHoldT=0,spinFrac=0;
function spinUpdate(){
  if(spinRaf)return;
  spinRaf=requestAnimationFrame(()=>{
    spinRaf=0;
    const want=busyN>0&&busyProg.size>0&&busyProg.size>=busyN,now=performance.now();
    if(want||busyN===0){spinDet=want;spinFalseAt=0}                  // the ring at once; when nothing is running there is nothing to hold
    else if(spinDet){
      if(!spinFalseAt)spinFalseAt=now;
      if(now-spinFalseAt>=SPIN_HOLD){spinDet=false;spinFalseAt=0}
      else{clearTimeout(spinHoldT);spinHoldT=setTimeout(spinUpdate,SPIN_HOLD-(now-spinFalseAt)+20)}
    }
    document.body.classList.toggle('det',spinDet);
    const slot=document.getElementById('spinslot');if(!slot)return;
    if(!spinDet){slot.title='Working in the background';return}
    if(busyProg.size){let d=0,t=0;busyProg.forEach(x=>{d+=x.done;t+=x.total});spinFrac=Math.max(0,Math.min(1,d/t))}   // while the ring is being held, the last value stays
    const frac=spinFrac,pc=Math.min(99,Math.floor(frac*100));
    document.getElementById('ringarc').style.strokeDashoffset=(81.68*(1-frac)).toFixed(2);
    document.getElementById('ringtxt').textContent=pc;
    slot.title='Working in the background: '+pc+'%';
  });
}
/* Rich text: n.body is always the plain text; n.html (only when something is formatted) holds <b>, <i>, <u> and <br>. */
function toast(t,opt){
  let box=document.getElementById('toasts');
  if(!box){box=document.createElement('div');box.id='toasts';box.setAttribute('aria-live','polite');document.body.append(box)}
  const d=document.createElement('div');d.className='toast';
  d.innerHTML=`<span class="tm"></span>${opt&&opt.label?'<button class="ta"></button>':''}<button class="tx2" aria-label="Dismiss" title="Dismiss">${ic('close',16)}</button>`;
  d.querySelector('.tm').textContent=t;
  if(opt&&opt.label){const b=d.querySelector('.ta');b.textContent=opt.label;b.addEventListener('click',()=>{close();opt.fn()})}
  box.append(d);
  let gone=false;
  const close=()=>{
    if(gone)return;gone=true;clearTimeout(timer);d.classList.remove('in');
    const rm=()=>d.remove();d.addEventListener('transitionend',rm,{once:true});setTimeout(rm,600);
  };
  d.querySelector('.tx2').addEventListener('click',close);
  d.getBoundingClientRect();
  requestAnimationFrame(()=>d.classList.add('in'));
  const timer=setTimeout(close,(opt&&opt.ms)||(opt&&opt.label?7000:4500));
}

/* Time of day for the status line */
const pad2=x=>String(x).padStart(2,'0');
const clock=()=>{const d=new Date(),h=d.getHours();return (h%12||12)+':'+String(d.getMinutes()).padStart(2,'0')+' '+(h<12?'AM':'PM')};

/* A short readable form of a web address, for showing in a list */
const linkText=u=>{try{const x=new URL(u);return x.hostname.replace(/^www\./,'')+(x.pathname!=='/'?x.pathname:'')}catch(e){return u}};
