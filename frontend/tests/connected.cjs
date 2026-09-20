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
const run = (c,id,requestId=randomUUID()) => action(c,{type:'addRun',id,requestId});

test('connected accounts, solo, shared party, authorization, groups and charity accounting',async () => {
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
 const solo=await action(a,{type:'create',input:{mode:'solo',difficulty:'medium',pledgeMinor:1000}});
 let c=(await snapshot(a)).challenges.find(x=>x.id===solo);
 assert.equal(c.status,'active'); assert.equal(c.mode,'solo'); assert.equal(c.participants.length,1);
 assert.equal((await snapshot(b)).challenges.some(x=>x.id===solo),false,'Solo is private');
 await assert.rejects(run(b,solo),/Join/);
 const requestId=randomUUID(); await run(a,solo,requestId); await run(a,solo,requestId);
 c=(await snapshot(a)).challenges.find(x=>x.id===solo); assert.equal(c.participants[0].verifiedRuns,1,'Duplicate request counts once');
 await action(a,{type:'settle',id:solo});
 c=(await snapshot(a)).challenges.find(x=>x.id===solo);
 assert.equal(c.payouts[0].totalMinor,Math.floor(1000/c.requiredRuns));
 assert.equal(c.charityMinor+c.payouts[0].totalMinor,1000);
 await assert.rejects(run(a,solo),/no longer/);
 await action(a,{type:'settle',id:solo});
 assert.deepEqual((await snapshot(a)).challenges.find(x=>x.id===solo).payouts,c.payouts,'Settlement idempotent');

 const gid=await action(a,{type:'createGroup',name:`QA circle ${suffix}`});
 const group=(await snapshot(a)).groups.find(x=>x.id===gid);
 await assert.rejects(action(b,{type:'create',input:{mode:'party',difficulty:'easy',pledgeMinor:500,groupId:gid}}),/Join/);
 await action(b,{type:'joinGroup',code:group.inviteCode.toLowerCase()});
 assert.equal((await snapshot(b)).groups[0].memberIds.length,2);
 const party=await action(a,{type:'create',input:{mode:'party',difficulty:'easy',pledgeMinor:500,groupId:gid}});
 c=(await snapshot(a)).challenges.find(x=>x.id===party);
 await assert.rejects(action(a,{type:'start',id:party}),/friend/);
 const preview=await rpc(b,'fitness_find_party',{p_code:c.inviteCode.toLowerCase()}); assert.equal(preview.id,party);
 await action(b,{type:'join',code:c.inviteCode}); await action(b,{type:'join',code:c.inviteCode});
 assert.equal((await snapshot(a)).challenges.find(x=>x.id===party).participants.length,2);
 await assert.rejects(action(b,{type:'start',id:party}),/host/);
 await action(a,{type:'vote',id:party}); await action(a,{type:'vote',id:party});
 assert.equal((await snapshot(a)).challenges.find(x=>x.id===party).replacementUsed,false);
 await action(b,{type:'vote',id:party});
 let updated=(await snapshot(a)).challenges.find(x=>x.id===party); assert.equal(updated.replacementUsed,true); assert.notEqual(updated.minimumDistanceMeters,c.minimumDistanceMeters);
 await action(a,{type:'start',id:party});
 assert.equal((await snapshot(b)).challenges.find(x=>x.id===party).status,'active','Second device sees start');
 await assert.rejects(action(outsider,{type:'join',code:c.inviteCode}),/already started/);
 await assert.rejects(action(b,{type:'settle',id:party}),/host/);
 for(let i=0;i<c.requiredRuns;i++) await run(b,party);
 assert.equal((await snapshot(a)).challenges.find(x=>x.id===party).participants.find(x=>x.userId===identities[1]).verifiedRuns,c.requiredRuns,'Host sees friend activity');
 await assert.rejects(run(b,party),/complete/);
 await action(a,{type:'settle',id:party}); c=(await snapshot(b)).challenges.find(x=>x.id===party);
 assert.equal(c.charityMinor,100); assert.equal(c.payouts.find(x=>x.userId===identities[1]).totalMinor,900); assert.equal(c.payouts.find(x=>x.userId===identities[0]).totalMinor,0);
 assert.equal(c.payouts.reduce((s,p)=>s+p.totalMinor,0)+c.charityMinor,1000);

 const nobody=await action(a,{type:'create',input:{mode:'party',difficulty:'easy',pledgeMinor:1000}});
 c=(await snapshot(a)).challenges.find(x=>x.id===nobody);
 await action(b,{type:'join',code:c.inviteCode}); await action(a,{type:'start',id:nobody}); await action(a,{type:'settle',id:nobody});
 c=(await snapshot(a)).challenges.find(x=>x.id===nobody); assert.equal(c.charityMinor,2000); assert.ok(c.payouts.every(p=>p.totalMinor===0));
 const full=await action(a,{type:'create',input:{mode:'solo',difficulty:'easy',pledgeMinor:500}});
 c=(await snapshot(a)).challenges.find(x=>x.id===full); for(let i=0;i<c.requiredRuns;i++) await run(a,full);
 await action(a,{type:'settle',id:full}); c=(await snapshot(a)).challenges.find(x=>x.id===full); assert.equal(c.charityMinor,0); assert.equal(c.payouts[0].totalMinor,500);
 const direct=await a.from('fitness_members').update({verified_runs:999}).eq('challenge_id',party); assert.ok(direct.error,'Direct mutation must be denied');
 await assert.rejects(rpc(a,'fitness_settle_internal',{p_id:party}));
 await Promise.all([a,b,outsider].map(c=>c.auth.signOut()));
 console.log('Passed: real signup/signin, privacy, shared invites/progress, group membership, host checks, idempotency, solo partial/full and party/all-fail charity payouts.');
});
