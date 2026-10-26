/* model.js: what a note is, and the state every other file shares.
   Host is how the lower layers (the folder engine) ask the page for things without knowing about it: app.js fills it in at start-up. */
'use strict';
const Host={render(){},collapsed(){},editing:()=>false,status(){}};
let notes=[],LB=[];
const KEEP_MOD=new Set();     // ids whose modified date must not move on the next save
const blank=()=>({id:uid(),title:'',body:'',html:'',isList:false,items:[],labels:[],att:[],links:[],color:0,pinned:false,trashed:false,ts:Date.now()});

/* Attachments are kept as two lists inside n.att: images and videos first, then audio. New ones go to the end of their own list. */
function partAtt(arr){arr=arr||[];return[...arr.filter(a=>a.kind!=='audio'),...arr.filter(a=>a.kind==='audio')]}
function addAtt(n,rec){
  if(rec.kind==='audio')n.att.push(rec);
  else n.att.splice(n.att.filter(a=>a.kind!=='audio').length,0,rec);
}
/* The text that search looks through. A note known only by its details (n.stub, see folder.js) has no text until its page has been read: metaText is all that is known about it. */
const noteText=n=>(n.title+' '+n.body+' '+(n.items||[]).map(i=>i.t).join(' ')+' '+(n.labels||[]).join(' ')+' '+(n.links||[]).map(l=>l.url).join(' ')).toLowerCase();
const metaText=n=>((n.labels||[]).join(' ')+' '+(n.links||[]).map(l=>l.url).join(' ')).toLowerCase();
const empty=n=>!n.title.trim()&&(n.isList?!n.items.some(i=>i.t.trim()):!n.body.trim())&&!(n.att||[]).length&&!(n.links||[]).length;
function seed(){
  const a=blank();a.title='Welcome to Lil Bro Keep';a.body='Capture notes and lists, then pin or colour them.\nClick any note to edit it. Everything is saved in this browser.';a.color=3;a.pinned=true;a.ts=Date.now()-1;
  const b=blank();b.title='Try a checklist';b.isList=true;b.items=[{t:'Tick this item off',d:false},{t:'Add a new item',d:false},{t:'Change the note colour',d:false},{t:'Already done',d:true}];b.color=6;b.ts=Date.now()-2;
  return[a,b];
}
/* What changed in a note, as one string: two notes with the same signature are the same note. */
const sigOf=n=>JSON.stringify([n.title,n.body,n.html,n.isList,n.items,n.labels,n.att,n.links,n.color,n.pinned,n.trashed,n.ts,n.sig,n.pos]);
function addLabel(name){
  name=String(name).trim();if(!name)return'';
  const f=LB.find(l=>l.toLowerCase()===name.toLowerCase());if(f)return f;
  LB.push(name);LB.sort((a,b)=>a.localeCompare(b));return name;
}

/* The image attachments of a note, in stored order */
const imagesOf=n=>(n.att||[]).filter(a=>a.kind==='image');
/* The moved images take over the image slots of the attachment list */
function reorderImages(n,ids){                    // the dragged/moved images take the image slots of the attachment list
  const by=new Map(n.att.map(a=>[a.id,a]));let k=0;
  n.att=n.att.map(a=>a.kind==='image'?by.get(ids[k++]):a);
}
/* A note that is pinned or unpinned goes to the top of the section it enters */
function moveToTop(n){n.pos=topKey(notes.filter(x=>x!==n&&!x.trashed&&!!x.pinned===!!n.pinned))}

/* The names of the twelve note colours, in order (colour i is the CSS variable --k<i>) */
const NAMES=['Default','Blush','Apricot','Butter','Pale green','Seafoam','Mist','Sky blue','Lavender','Mauve','Sand','Fog'];
