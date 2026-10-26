const {orderKey,byOrder,placeNote,topKey}=require('../js/order.js');
let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
function run(N,moves,crowd){
  const base=1.7e12;
  let notes=Array.from({length:N},(_,i)=>({id:'n'+String(i).padStart(3,'0'),ts:base-i*(crowd?0.5:1000)}));
  let model=notes.slice().sort(byOrder).map(n=>n.id);          // expected order, tracked by hand
  let maxChanged=0;
  for(let m=0;m<moves;m++){
    const id=model[Math.floor(rnd()*N)];
    const rest=model.filter(x=>x!==id);
    const slot=crowd?Math.min(rest.length,3):Math.floor(rnd()*(rest.length+1));   // crowd: hammer the same spot
    const prevId=slot>0?rest[slot-1]:null;
    const ch=placeNote(notes,id,prevId);
    maxChanged=Math.max(maxChanged,Object.keys(ch).length);
    for(const [k,v] of Object.entries(ch))notes.find(n=>n.id===k).pos=v;
    model=rest.slice();model.splice(slot,0,id);
    const got=notes.slice().sort(byOrder).map(n=>n.id);
    if(got.join()!==model.join()){console.log('MISMATCH at move',m,'slot',slot);return false}
  }
  console.log(`ok N=${N} moves=${moves} crowd=${!!crowd} max notes rewritten per move=${maxChanged}`);return true;
}
let ok=run(30,2000)&&run(5,500)&&run(40,3000,true)&&run(2,50)&&run(1,5);
// ties and tie-break
const a=[{id:'b',ts:5},{id:'a',ts:5}];console.log('tie order',a.sort(byOrder).map(n=>n.id).join());
console.log('top key',topKey([{id:'x',ts:10},{id:'y',pos:25}]));
process.exit(ok?0:1);
