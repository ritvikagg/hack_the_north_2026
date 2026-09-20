// Real local Supabase integration. Creates isolated QA accounts and simulated challenges.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').trim().split(/\r?\n/).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const url = env.EXPO_PUBLIC_SUPABASE_URL;
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):54321$/,'Run only against local Supabase');
const client = () => createClient(url,env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function rpc(c,name,args) { const {data,error}=await c.rpc(name,args); if(error) throw new Error(error.message); return data; }
const action = (c,a) => rpc(c,'fitness_action',{p_action:a});
const snapshot = c => rpc(c,'fitness_snapshot');
const day = (c,id,requestId=randomUUID()) => action(c,{type:'addDay',id,requestId});

test('connected accounts, solo, shared party, authorization, groups and all-or-nothing accounting',async () => {
 const suffix=randomUUID().slice(0,8); const password=randomUUID()+'Aa1!';
 const a=client(), b=client(), outsider=client(), anonymous=client();
 const identities=[];
 for(const [c,name] of [[a,'Host'],[b,'Friend'],[outsider,'Outsider']]) {
   const email=`qa-${name.toLowerCase()}-${suffix}@example.test`;
   const result=await c.auth.signUp({email,password,options:{data:{display_name:`QA ${name} ${suffix}`}}});
   assert.equal(result.error,null); assert.ok(result.data.session); identities.push(result.data.user.id);
 }
 const wrong=await client().auth.signInWithPassword({email:`qa-host-${suffix}@example.test`,password:'wrong-password'});
 assert.ok(wrong.error,'Wrong password must fail');
 await a.auth.signOut();
 assert.ok((await a.auth.signInWithPassword({email:`qa-host-${suffix}@example.test`,password})).data.session,'Sign in after sign out');
 await assert.rejects(snapshot(anonymous));
 const solo=await action(a,{type:'create',input:{mode:'solo',dailyStepGoal:10000,requiredDays:3,pledgeMinor:1000}});
 let c=(await snapshot(a)).challenges.find(x=>x.id===solo);
 assert.equal(c.status,'active'); assert.equal(c.mode,'solo'); assert.equal(c.participants.length,1);
 assert.equal(c.dailyStepGoal,10000); assert.equal(c.requiredDays,3);
 assert.equal((await snapshot(b)).challenges.some(x=>x.id===solo),false,'Solo is private');
 await assert.rejects(day(b,solo),/Join/);
 const requestId=randomUUID(); await day(a,solo,requestId); await day(a,solo,requestId);
 c=(await snapshot(a)).challenges.find(x=>x.id===solo); assert.equal(c.participants[0].completedDays,1,'Duplicate request counts once');
 await action(a,{type:'settle',id:solo});
 c=(await snapshot(a)).challenges.find(x=>x.id===solo);
 assert.equal(c.payouts[0].totalMinor,0,'Unfinished deposit is never partially returned');
 assert.equal(c.charityMinor,1000);
 await assert.rejects(day(a,solo),/no longer/);
 await action(a,{type:'settle',id:solo});
 assert.deepEqual((await snapshot(a)).challenges.find(x=>x.id===solo).payouts,c.payouts,'Settlement idempotent');

 const gid=await action(a,{type:'createGroup',name:`QA circle ${suffix}`});
 const group=(await snapshot(a)).groups.find(x=>x.id===gid);
 await assert.rejects(action(b,{type:'create',input:{mode:'party',dailyStepGoal:8000,requiredDays:2,pledgeMinor:500,groupId:gid}}),/Join/);
 await action(b,{type:'joinGroup',code:group.inviteCode.toLowerCase()});
 assert.equal((await snapshot(b)).groups[0].memberIds.length,2);
 const party=await action(a,{type:'create',input:{mode:'party',dailyStepGoal:8000,requiredDays:2,pledgeMinor:500,groupId:gid}});
 c=(await snapshot(a)).challenges.find(x=>x.id===party);
 await assert.rejects(action(a,{type:'start',id:party}),/friend/);
 const preview=await rpc(b,'fitness_find_party',{p_code:c.inviteCode.toLowerCase()}); assert.equal(preview.id,party);
 await action(b,{type:'join',code:c.inviteCode}); await action(b,{type:'join',code:c.inviteCode});
 assert.equal((await snapshot(a)).challenges.find(x=>x.id===party).participants.length,2);
 await assert.rejects(action(b,{type:'start',id:party}),/host/);
 await assert.rejects(action(a,{type:'vote',id:party}),/not supported/,'Goal voting is gone; the goal is chosen at creation');
 await action(a,{type:'start',id:party});
 assert.equal((await snapshot(b)).challenges.find(x=>x.id===party).status,'active','Second device sees start');
 await assert.rejects(action(outsider,{type:'join',code:c.inviteCode}),/already started/);
 await assert.rejects(action(b,{type:'settle',id:party}),/host/);
 for(let i=0;i<c.requiredDays;i++) await day(b,party);
 assert.equal((await snapshot(a)).challenges.find(x=>x.id===party).participants.find(x=>x.userId===identities[1]).completedDays,c.requiredDays,'Host sees friend activity');
 assert.equal((await snapshot(a)).challenges.find(x=>x.id===party).status,'active','Challenge stays open until everyone finishes');
 await assert.rejects(day(b,party),/complete/);
 for(let i=0;i<c.requiredDays;i++) await day(a,party);
 c=(await snapshot(b)).challenges.find(x=>x.id===party);
 assert.equal(c.status,'settled','Party settles itself once everyone finishes');
 assert.equal(c.charityMinor,0);
 assert.ok(c.payouts.every(p=>p.totalMinor===500&&p.pledgeReturnedMinor===500),'Every finisher gets the full pledge back');

 const nobody=await action(a,{type:'create',input:{mode:'party',dailyStepGoal:8000,requiredDays:5,pledgeMinor:1000}});
 c=(await snapshot(a)).challenges.find(x=>x.id===nobody);
 await action(b,{type:'join',code:c.inviteCode}); await action(a,{type:'start',id:nobody}); await action(a,{type:'settle',id:nobody});
 c=(await snapshot(a)).challenges.find(x=>x.id===nobody); assert.equal(c.charityMinor,2000); assert.ok(c.payouts.every(p=>p.totalMinor===0));
 const full=await action(a,{type:'create',input:{mode:'solo',dailyStepGoal:5000,requiredDays:2,pledgeMinor:500}});
 c=(await snapshot(a)).challenges.find(x=>x.id===full); for(let i=0;i<c.requiredDays;i++) await day(a,full);
 c=(await snapshot(a)).challenges.find(x=>x.id===full); assert.equal(c.status,'settled'); assert.equal(c.charityMinor,0); assert.equal(c.payouts[0].totalMinor,500);
 const direct=await a.from('fitness_members').update({completed_days:999}).eq('challenge_id',party); assert.ok(direct.error,'Direct mutation must be denied');
 await assert.rejects(rpc(a,'fitness_settle_internal',{p_id:party}));
 await Promise.all([a,b,outsider].map(c=>c.auth.signOut()));
 console.log('Passed: real signup/signin, privacy, shared invites/progress, group membership, host checks, idempotency, all-or-nothing solo and party payouts.');
});
