export const VERSION=2;
export const uid=()=>crypto.randomUUID();
export function today(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return Number.isFinite(+d)&&today(d)===s}
export function emptyState(){return {version:VERSION,courses:[],notes:[],materials:[],tasks:[],questions:[],sessions:[],reviews:[],glossary:[],settings:{font:20,contrast:false,minutes:20,dailyGoal:30,address:'m',name:'',institution:'',speechRate:0.9}}}
const fail=()=>{throw Error('מבנה הנתונים אינו תקין. הנתונים הקיימים לא הוחלפו.')};
const str=(s,max=200)=>typeof s==='string'&&s.length<=max;
const num=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const list=(d,k,max)=>Array.isArray(d[k])&&d[k].length<=max;
export function validate(input){
 const d=structuredClone(input);if(d?.version===VERSION){d.glossary??=[];if(d.settings){d.settings.name??='';d.settings.institution??='';d.settings.speechRate??=0.9}}
 if(!d||d.version!==VERSION)fail();
 for(const [k,max] of Object.entries({courses:100,notes:1000,materials:200,tasks:2000,questions:2000,sessions:10000,reviews:10000,glossary:2000}))if(!list(d,k,max))fail();
 const ids=new Set();for(const k of ['courses','notes','materials','tasks','questions','sessions','reviews','glossary'])for(const x of d[k]){if(!x||!str(x.id,100)||!x.id||ids.has(x.id))fail();ids.add(x.id)}
 const courses=new Set(d.courses.map(c=>c.id));
 const belongs=x=>courses.has(x.courseId);
 if(!d.courses.every(c=>str(c.name,150)&&c.name.trim()&&str(c.description,1000)))fail();
 if(!d.notes.every(n=>belongs(n)&&str(n.title,200)&&n.title.trim()&&str(n.text,200000)&&str(n.updatedAt,40)&&Number.isFinite(Date.parse(n.updatedAt))&&(!n.versions||(Array.isArray(n.versions)&&n.versions.length<=10&&n.versions.every(v=>str(v.title,200)&&str(v.text,200000)&&str(v.updatedAt,40)&&Number.isFinite(Date.parse(v.updatedAt)))) )))fail();
 if(!d.tasks.every(t=>belongs(t)&&str(t.title,200)&&t.title.trim()&&(!t.date||validDate(t.date))&&typeof t.done==='boolean'&&num(t.minutes,5,480)&&(!t.planned||validDate(t.planned))))fail();
 if(!d.materials.every(m=>belongs(m)&&str(m.title,200)&&['link','file'].includes(m.kind)&&(m.kind==='link'?validURL(m.url):str(m.data,2800000)&&/^data:(application\/pdf|image\/(png|jpeg|webp)|text\/plain);base64,[A-Za-z0-9+/=]*$/.test(m.data))))fail();
 if(!d.glossary.every(g=>belongs(g)&&str(g.term,200)&&g.term.trim()&&str(g.original,200)&&str(g.definition,5000)&&g.definition.trim()))fail();
 if(!d.questions.every(q=>belongs(q)&&str(q.prompt,2000)&&q.prompt.trim()&&str(q.answer,5000)&&q.answer.trim()))fail();
 if(!d.sessions.every(s=>belongs(s)&&num(s.minutes,0.01,480)&&validDate(s.date)))fail();
 const questions=new Set(d.questions.map(q=>q.id));
 if(!d.reviews.every(r=>questions.has(r.questionId)&&typeof r.correct==='boolean'&&validDate(r.date)))fail();
 const s=d.settings;if(!s||!num(s.font,18,32)||typeof s.contrast!=='boolean'||!num(s.minutes,5,120)||!num(s.dailyGoal,5,480)||!['m','f','n'].includes(s.address)||!str(s.name,150)||!str(s.institution,150)||!num(s.speechRate,0.5,1.5))fail();
 // Copy only known fields. Unknown properties never reach application state.
 return {version:VERSION,...Object.fromEntries(['courses','notes','materials','tasks','questions','sessions','reviews','glossary'].map(k=>[k,d[k].map(x=>({...x}))])),settings:{font:s.font,contrast:s.contrast,minutes:s.minutes,dailyGoal:s.dailyGoal,address:s.address,name:s.name,institution:s.institution,speechRate:s.speechRate}};
}
export function validURL(s){try{const u=new URL(s);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}
export function migrate(old){
 if(old?.version===VERSION)return validate(old);
 if(!old||!Array.isArray(old.courses)||old.courses.length>100)fail();
 const d=emptyState();d.courses=old.courses.map(c=>{if(!Array.isArray(c)||!str(c[0],150)||!c[0].trim())fail();return{id:uid(),name:c[0],description:''}});
 for(const [i,text] of Object.entries(old.notes||{})){if(d.courses[i]&&typeof text==='string')d.notes.push({id:uid(),courseId:d.courses[i].id,title:'סיכום מהגרסה הקודמת',text,updatedAt:new Date().toISOString()})}
 for(const t of old.tasks||[])if(d.courses[t.course]&&typeof t.name==='string')d.tasks.push({id:uid(),courseId:d.courses[t.course].id,title:t.name,date:validDate(t.date)?t.date:'',planned:'',done:!!t.done,minutes:20});
 if(num(old.minutes,5,120))d.settings.minutes=old.minutes;if(num(old.dailyGoal,5,480))d.settings.dailyGoal=old.dailyGoal;if(['m','f','n'].includes(old.address))d.settings.address=old.address;
 // Legacy sessions lack course/duration; preserve them separately in the original backup, never invent study time.
 return validate(d);
}
export function removeCourse(d,id){const next=structuredClone(d),qs=new Set(next.questions.filter(q=>q.courseId===id).map(q=>q.id));for(const k of ['courses','notes','materials','tasks','questions','sessions','glossary'])next[k]=next[k].filter(x=>k==='courses'?x.id!==id:x.courseId!==id);next.reviews=next.reviews.filter(r=>!qs.has(r.questionId));return validate(next)}
export function weekDates(offset=0,now=new Date()){const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-start.getDay()+offset*7);return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return today(d)})}
export function stats(d,date=today()){return {todayMinutes:d.sessions.filter(s=>s.date===date).reduce((a,s)=>a+s.minutes,0),totalMinutes:d.sessions.reduce((a,s)=>a+s.minutes,0),done:d.tasks.filter(t=>t.done).length,overdue:d.tasks.filter(t=>!t.done&&t.date&&t.date<date).length}}
export function reviewDue(d,questionId){const rs=d.reviews.filter(r=>r.questionId===questionId);if(!rs.length)return '';const last=rs.at(-1);let streak=0;for(let i=rs.length-1;i>=0&&rs[i].correct;i--)streak++;const days=last.correct?Math.min(30,[1,3,7,14,30][Math.min(streak-1,4)]):0;const due=new Date(last.date+'T12:00:00');due.setDate(due.getDate()+days);return today(due)}
export function reviewQueue(d,courseId='',date=today()){return d.questions.filter(q=>(!courseId||q.courseId===courseId)&&(!reviewDue(d,q.id)||reviewDue(d,q.id)<=date)).sort((a,b)=>reviewDue(d,a.id).localeCompare(reviewDue(d,b.id)))}
export function weeklyReport(d,now=new Date()){const days=weekDates(0,now),start=days[0],end=days[6],sessions=d.sessions.filter(s=>s.date>=start&&s.date<=end),lines=['StudyFlow — דוח שבועי',start+' — '+end,'זמן למידה שתועד: '+Math.round(sessions.reduce((a,s)=>a+s.minutes,0))+' דקות','יחידות למידה: '+sessions.length,'סיכומים שמורים: '+d.notes.length,'חומרי לימוד שמורים: '+d.materials.length];for(const c of d.courses){const mins=Math.round(sessions.filter(s=>s.courseId===c.id).reduce((a,s)=>a+s.minutes,0));lines.push(c.name+': '+mins+' דקות; '+d.notes.filter(n=>n.courseId===c.id).length+' סיכומים; '+d.tasks.filter(t=>t.courseId===c.id&&!t.done).length+' משימות פתוחות')}lines.push('מועדי הגשה פתוחים:');for(const t of d.tasks.filter(t=>!t.done&&t.date).sort((a,b)=>a.date.localeCompare(b.date)))lines.push(t.date+' · '+t.title);lines.push('הדוח מבוסס על תיעוד עצמי בלבד. אין כאן הערכת מוכנות למבחן או ניתוח תוכן.');return lines.join('\n')}
export function lumiReply(d,text){const s=stats(d),q=text.trim();if(/משימ|הגשה|דחוף/.test(q)){const tasks=d.tasks.filter(t=>!t.done).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).slice(0,5);return tasks.length?'המשימות הקרובות שלך:\n'+tasks.map(t=>`${t.title} · ${t.date||'ללא מועד'}`).join('\n'):'אין כרגע משימות פתוחות. אפשר להוסיף משימה בתכנון השבועי.'}if(/התקדמ|כמה|מטרה/.test(q))return `היום תועדו ${Math.round(s.todayMinutes)} דקות מתוך יעד של ${d.settings.dailyGoal}. בסך הכול ${Math.round(s.totalMinutes)} דקות ו־${s.done} משימות הושלמו.`;if(/תרג|שאל|חזר/.test(q))return d.questions.length?`יש לך ${d.questions.length} שאלות חזרה. בלשונית תרגול השאלות שטרם תרגלת ושאלות שהיו קשות מוצגות קודם.`:'עוד אין שאלות חזרה. הוסף שאלה ותשובה מתוך חומרי הלימוד שלך בלשונית תרגול.';if(/סיכו|חומר/.test(q))return `שמורים אצלך ${d.notes.length} סיכומים ו־${d.materials.length} חומרי לימוד. אפשר לחפש, לערוך ולהקריא סיכומים בקורסים. אין לי כרגע יכולת לייצר סיכום או לנתח קובץ באמצעות AI.`;return 'אני עוזר מקומי שמסתמך על הנתונים שלך. אפשר לבקש: ״מה המשימות הקרובות?״, ״מה ההתקדמות שלי?״ או ״איך מתחילים לתרגל?״. מענה חופשי באמצעות AI עדיין לא מחובר.'}
