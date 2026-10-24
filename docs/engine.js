window.StudyEngine = (() => {
  const {topics,questions} = StudyData;
  const today = () => {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const uid=()=>globalThis.crypto?.randomUUID?.() || 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2);
  const fresh=()=>({version:1,created:today(),attempts:[],reviews:{},stages:Object.fromEntries(topics.map(t=>[t.id,t.stage])),tasks:{},logs:[],notes:[],weekly:{}});
  function ensureDay(s,day=today()){
    if(!s.tasks[day]) s.tasks[day]=[
      {id:uid(),title:s.attempts.some(a=>a.qid.startsWith('m'))?'数学：复查到期题，再补一道同类基础题':'数学：二次函数与方程难度校准',minutes:25,done:false,action:s.attempts.some(a=>a.qid.startsWith('m'))?'reviews':'diagnostic',subject:'math'},
      {id:uid(),title:s.attempts.some(a=>a.qid.startsWith('p'))?'物理：复查位移与速度，再练一个小点':'物理：检查位移与平均速度的基础',minutes:20,done:false,action:s.attempts.some(a=>a.qid.startsWith('p'))?'reviews':'physics',subject:'physics'},
      {id:uid(),title:'选一道卡住的题，写出卡点与下一步',minutes:10,done:false,action:'note',subject:'math'}
    ];
    return s.tasks[day];
  }
  function record(s,q,choice,hints,day=today()){
    const correct=choice===q.answer;
    const seen=s.attempts.some(a=>a.qid===q.id&&a.day===day);
    const independent=correct&&hints===0&&!seen;
    const a={id:uid(),qid:q.id,day,choice,correct,hints,independent,blocker:'',note:''};
    s.attempts.push(a);
    const prior=s.reviews[q.id];
    let stage=prior?.stage||0;
    if(independent && (!prior || prior.lastDay!==day)) stage=Math.min(3,stage+1);
    else if(!correct||hints>0)stage=0;
    const days=stage===0?1:stage===1?1:stage===2?3:7;
    // 当天再练正确不应推迟已安排的复查，也不增加掌握计数。
    if(!seen || !correct || hints>0) s.reviews[q.id]={due:addDays(day,days),stage,lastDay:day};
    return a;
  }
  function status(s,topic){
    const ids=questions.filter(q=>q.topic===topic).map(q=>q.id);
    const a=s.attempts.filter(a=>ids.includes(a.qid));
    if(!a.length)return {label:s.stages[topic]==='new'?'尚未开始':s.stages[topic]==='unknown'?'待检查':'已听课 · 待自测',tone:'quiet'};
    const unique=new Set(a.filter(x=>x.independent).map(x=>x.qid));
    const delayed=a.some(x=>x.independent&&a.some(y=>y.qid===x.qid&&y.day<x.day));
    const latest=ids.map(id=>a.filter(x=>x.qid===id).at(-1)).filter(Boolean);
    if(latest.some(x=>!x.correct||x.hints>0))return {label:'有卡点 · 需巩固',tone:'amber'};
    if(unique.size>=2&&delayed)return {label:'基础复查通过',tone:'green'};
    if(unique.size>=2)return {label:'待隔天复查',tone:'blue'};
    return {label:'练习中',tone:'blue'};
  }
  function queue(s,day=today()){
    return Object.entries(s.reviews).filter(([id,r])=>r.due<=day&&questions.some(q=>q.id===id)).sort((a,b)=>a[1].due.localeCompare(b[1].due));
  }
  function validate(value){
    if(value?.version==='qibu-offline-simple-1')value=fromOffline(value);
    if(!value || value.version!==1 || !Array.isArray(value.attempts)||!Array.isArray(value.logs)||!Array.isArray(value.notes)||typeof value.tasks!=='object'||!value.tasks)throw Error('文件格式不符合起步备份格式。');
    const s=fresh();
    const str=(v,max=2000)=>typeof v==='string'?v.slice(0,max):'';
    const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'));
    const qmap=new Map(questions.map(q=>[q.id,q]));
    const subject=v=>['math','physics','chinese','english','chemistry','biology','other'].includes(v)?v:'other';
    if(value.attempts.length>20000||value.logs.length>20000||value.notes.length>5000||Object.keys(value.tasks).length>5000)throw Error('记录数量超出可导入范围。');
    s.created=date(value.created)?value.created:s.created;
    s.attempts=value.attempts.filter(a=>a&&qmap.has(a.qid)&&date(a.day)&&(Number.isInteger(a.choice)&&a.choice>=-1&&a.choice<4||a.importedOffline===true&&a.choice===null&&typeof a.correct==='boolean')&&Number.isInteger(a.hints)&&a.hints>=0&&a.hints<=3).map(a=>{const importedOffline=a.importedOffline===true&&a.choice===null;const correct=importedOffline?a.correct:a.choice===qmap.get(a.qid).answer;return {id:str(a.id,100)||uid(),qid:a.qid,day:a.day,choice:a.choice,hints:a.hints,correct,independent:correct&&a.hints===0&&a.independent===true,blocker:str(a.blocker,100),note:str(a.note),...(importedOffline?{importedOffline:true}:{})};});
    if(value.reviews&&typeof value.reviews==='object') for(const [k,r] of Object.entries(value.reviews))if(qmap.has(k)&&r&&date(r.due)&&date(r.lastDay)&&Number.isInteger(r.stage)&&r.stage>=0&&r.stage<=3)s.reviews[k]={due:r.due,stage:r.stage,lastDay:r.lastDay};
    for(const t of topics)if(['new','heard','unknown'].includes(value.stages?.[t.id]))s.stages[t.id]=value.stages[t.id];
    for(const [d,arr] of Object.entries(value.tasks))if(date(d)&&Array.isArray(arr))s.tasks[d]=arr.slice(0,50).filter(t=>t&&typeof t==='object').map(t=>({id:str(t.id,100)||uid(),title:str(t.title,200),minutes:Math.max(1,Math.min(600,Number(t.minutes)||20)),done:!!t.done,action:['diagnostic','physics','note','reviews'].includes(t.action)?t.action:'',subject:subject(t.subject)}));
    s.logs=value.logs.filter(l=>date(l.day)&&Number.isFinite(l.minutes)&&l.minutes>=1&&l.minutes<=1000).map(l=>({id:str(l.id,100)||uid(),day:l.day,subject:subject(l.subject),type:['听课','练习','复习','阅读资料','背诵'].includes(l.type)?l.type:'练习',minutes:l.minutes,note:str(l.note,300)}));
    s.notes=value.notes.filter(n=>date(n.due)&&topics.some(t=>t.id===n.topic)).map(n=>({id:str(n.id,100)||uid(),topic:n.topic,ref:str(n.ref,300),blocker:str(n.blocker,100),attempt:str(n.attempt),step:str(n.step),due:n.due,created:date(n.created)?n.created:s.created,checks:Number.isInteger(n.checks)?Math.max(0,Math.min(100,n.checks)):0}));
    if(value.weekly&&typeof value.weekly==='object')for(const [d,n]of Object.entries(value.weekly))if(date(d)&&n&&typeof n==='object')s.weekly[d]={worked:str(n.worked),stuck:str(n.stuck),next:str(n.next)};
    return s;
  }
  function fromOffline(value){
    if(!Array.isArray(value.attempts)||!Array.isArray(value.notes)||!value.reviews||typeof value.reviews!=='object')throw Error('离线版备份格式不正确。');
    if(value.attempts.length>20000||value.notes.length>5000)throw Error('记录数量超出可导入范围。');
    const s=fresh();
    s.attempts=value.attempts.filter(a=>a&&typeof a.correct==='boolean').map(a=>({id:uid(),qid:a.qid,day:a.day,choice:null,correct:a.correct,independent:a.independent===true,hints:a.hints,blocker:'',note:a.note,importedOffline:true}));
    for(const [id,r]of Object.entries(value.reviews))if(r)s.reviews[id]={due:r.due,stage:r.stage,lastDay:r.last};
    s.notes=value.notes.filter(n=>n&&typeof n==='object').map(n=>({id:uid(),topic:n.subject==='物理'?'legacy-physics':'legacy-math',ref:n.ref,blocker:'',attempt:n.stuck,step:n.step,due:n.due,created:today(),checks:0}));
    return s;
  }
  return {today,addDays,uid,fresh,ensureDay,record,status,queue,validate};
})();
