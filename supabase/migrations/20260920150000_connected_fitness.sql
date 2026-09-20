-- Hackathon app: real accounts/shared state; all pledges and payouts are simulated.
create table public.fitness_groups (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 60),
 host_id uuid not null references auth.users(id), invite_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))
);
create table public.fitness_group_members (
 group_id uuid references public.fitness_groups(id) on delete cascade, user_id uuid references auth.users(id), primary key(group_id,user_id)
);
create table public.fitness_challenges (
 id uuid primary key default gen_random_uuid(), title text not null, mode text not null check(mode in ('solo','party')),
 difficulty text not null check(difficulty in ('easy','medium','hard')), required_runs integer not null check(required_runs>0),
 minimum_distance_meters integer not null, pledge_minor integer not null check(pledge_minor in (500,1000,2000)),
 host_id uuid not null references auth.users(id), group_id uuid references public.fitness_groups(id),
 status text not null default 'lobby' check(status in ('lobby','active','settled')),
 created_at timestamptz not null default now(), starts_at timestamptz, ends_at timestamptz,
 invite_code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
 replacement_used boolean not null default false, replacement_votes uuid[] not null default '{}',
 charity_minor integer not null default 0, payouts jsonb not null default '[]'
);
create table public.fitness_members (
 challenge_id uuid references public.fitness_challenges(id) on delete cascade, user_id uuid references auth.users(id),
 verified_runs integer not null default 0 check(verified_runs>=0), joined_at timestamptz not null default now(), primary key(challenge_id,user_id)
);
create table public.fitness_runs (
 id uuid primary key default gen_random_uuid(), challenge_id uuid not null references public.fitness_challenges(id),
 user_id uuid not null references auth.users(id), distance_meters integer not null, duration_seconds integer not null,
 completed_at timestamptz not null default now(), request_id text not null unique
);
alter table public.fitness_groups enable row level security;
alter table public.fitness_group_members enable row level security;
alter table public.fitness_challenges enable row level security;
alter table public.fitness_members enable row level security;
alter table public.fitness_runs enable row level security;
-- No direct client writes or reads; bounded RPCs below enforce membership.
revoke all on public.fitness_groups, public.fitness_group_members, public.fitness_challenges, public.fitness_members, public.fitness_runs from anon, authenticated;

create function public.fitness_settle_internal(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.fitness_challenges; m record; n integer; winners integer; pot integer; charity integer; available integer; amount integer; returned integer; remainder integer; v_payouts jsonb := '[]';
begin
 select * into c from public.fitness_challenges where id=p_id for update;
 if c.status <> 'active' then return; end if;
 select count(*), count(*) filter(where verified_runs>=c.required_runs) into n,winners from public.fitness_members where challenge_id=p_id;
 pot := n*c.pledge_minor;
 if c.mode='solo' then
   select least(verified_runs,c.required_runs)*c.pledge_minor/c.required_runs into amount from public.fitness_members where challenge_id=p_id;
   charity := pot-amount;
   v_payouts := jsonb_build_array(jsonb_build_object('userId',c.host_id,'pledgeReturnedMinor',amount,'bonusMinor',0,'totalMinor',amount));
 else
   charity := case when winners=0 then pot else pot/10 end;
   available := pot-charity;
   remainder := case when winners>0 then available%winners else 0 end;
   for m in select * from public.fitness_members where challenge_id=p_id order by joined_at,user_id loop
     amount := 0;
     if m.verified_runs>=c.required_runs and winners>0 then
       amount := available/winners + case when remainder>0 then 1 else 0 end;
       remainder := greatest(0,remainder-1);
     end if;
     returned := least(c.pledge_minor*9/10,amount);
     v_payouts := v_payouts || jsonb_build_array(jsonb_build_object('userId',m.user_id,'pledgeReturnedMinor',returned,'bonusMinor',amount-returned,'totalMinor',amount));
   end loop;
 end if;
 update public.fitness_challenges set status='settled',ends_at=least(ends_at,now()),charity_minor=charity,payouts=v_payouts where id=p_id;
end $$;
revoke all on function public.fitness_settle_internal(uuid) from public,anon,authenticated;

create function public.fitness_challenge_json(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'mode',c.mode,'difficulty',c.difficulty,'requiredRuns',c.required_runs,
 'minimumDistanceMeters',c.minimum_distance_meters,'pledgeMinor',c.pledge_minor,'currency','CAD','hostId',c.host_id,'groupId',c.group_id,
 'status',c.status,'createdAt',c.created_at,'startsAt',c.starts_at,'endsAt',c.ends_at,'inviteCode',case when c.mode='party' then c.invite_code else '' end,
 'replacementUsed',c.replacement_used,'replacementVotes',to_jsonb(c.replacement_votes),'payouts',c.payouts,'charityMinor',c.charity_minor,
 'participants',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'verifiedRuns',m.verified_runs) order by m.joined_at,m.user_id) from public.fitness_members m where m.challenge_id=c.id),'[]'))
 from public.fitness_challenges c where c.id=p_id
$$;
revoke all on function public.fitness_challenge_json(uuid) from public,anon,authenticated;

create function public.fitness_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); expired record;
begin
 if me is null then raise exception 'Sign in first.'; end if;
 for expired in select c.id from public.fitness_challenges c join public.fitness_members m on m.challenge_id=c.id where m.user_id=me and c.status='active' and c.ends_at<=now() loop
   perform public.fitness_settle_internal(expired.id);
 end loop;
 return jsonb_build_object('version',1,'hasEntered',true,'currentUserId',me,
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'initials',upper(left(p.display_name,1)),'color','#DDEAA4')) from public.profiles p),'[]'),
 'challenges',coalesce((select jsonb_agg(public.fitness_challenge_json(c.id) order by c.created_at desc) from public.fitness_challenges c where exists(select 1 from public.fitness_members m where m.challenge_id=c.id and m.user_id=me) or (c.mode='party' and exists(select 1 from public.fitness_group_members gm where gm.group_id=c.group_id and gm.user_id=me))),'[]'),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description','A shared goal. A little accountability.','inviteCode',g.invite_code,'color','#E7EDD5','memberIds',(select jsonb_agg(gm.user_id) from public.fitness_group_members gm where gm.group_id=g.id))) from public.fitness_groups g where exists(select 1 from public.fitness_group_members gm where gm.group_id=g.id and gm.user_id=me)),'[]'),
 'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'challengeId',r.challenge_id,'userId',r.user_id,'distanceMeters',r.distance_meters,'durationSeconds',r.duration_seconds,'completedAt',r.completed_at,'verification','verified','countsTowardGoal',true,'source','demo') order by r.completed_at desc) from public.fitness_runs r where r.user_id=me),'[]'));
end $$;

create function public.fitness_find_party(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select id into cid from public.fitness_challenges where mode='party' and invite_code=upper(trim(p_code));
 if cid is null then raise exception 'No party found. Check the invite code.'; end if;
 return public.fitness_challenge_json(cid);
end $$;

create function public.fitness_action(p_action jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); kind text:=p_action->>'type'; cid uuid; gid uuid; c public.fitness_challenges; n integer; runs integer; meters integer; difficulty text; mode text; pledge integer; member_runs integer;
begin
 if me is null then raise exception 'Sign in first.'; end if;
 if kind='createGroup' then
   if length(trim(coalesce(p_action->>'name',''))) not between 1 and 60 then raise exception 'Enter a group name (1–60 characters).'; end if;
   insert into public.fitness_groups(name,host_id) values(trim(p_action->>'name'),me) returning id into gid;
   insert into public.fitness_group_members values(gid,me); return gid;
 elsif kind='joinGroup' then
   select id into gid from public.fitness_groups where invite_code=upper(trim(p_action->>'code'));
   if gid is null then raise exception 'Group not found. Check the invite code.'; end if;
   insert into public.fitness_group_members values(gid,me) on conflict do nothing; return gid;
 elsif kind='create' then
   difficulty:=p_action->'input'->>'difficulty'; mode:=coalesce(p_action->'input'->>'mode','party'); pledge:=(p_action->'input'->>'pledgeMinor')::integer;
   if difficulty is null or difficulty not in ('easy','medium','hard') or mode not in ('solo','party') or pledge is null or pledge not in (500,1000,2000) then raise exception 'Choose a valid goal and pledge.'; end if;
   gid:=nullif(p_action->'input'->>'groupId','')::uuid;
   if mode='solo' then gid:=null; end if;
   if gid is not null and not exists(select 1 from public.fitness_group_members where group_id=gid and user_id=me) then raise exception 'Join this group first.'; end if;
   runs:=case difficulty when 'easy' then 2 when 'medium' then 3 else 4 end + floor(random()*2)::integer;
   meters:=case difficulty when 'easy' then 1000 when 'medium' then 2000 else 3500 end;
   insert into public.fitness_challenges(title,mode,difficulty,required_runs,minimum_distance_meters,pledge_minor,host_id,group_id,status,starts_at,ends_at)
   values(case when mode='solo' then 'My weekly promise' else 'Our weekly promise' end,mode,difficulty,runs,meters,pledge,me,gid,
   case when mode='solo' then 'active' else 'lobby' end,case when mode='solo' then now() end,case when mode='solo' then now()+interval '7 days' end) returning id into cid;
   insert into public.fitness_members(challenge_id,user_id) values(cid,me); return cid;
 elsif kind='join' then
   select * into c from public.fitness_challenges where fitness_challenges.mode='party' and invite_code=upper(trim(p_action->>'code')) for update;
   if c.id is null then raise exception 'No party found. Check the invite code.'; end if;
   if exists(select 1 from public.fitness_members where challenge_id=c.id and user_id=me) then return c.id; end if;
   if c.status<>'lobby' then raise exception 'This party has already started.'; end if;
   insert into public.fitness_members(challenge_id,user_id) values(c.id,me); return c.id;
 end if;
 cid:=(p_action->>'id')::uuid;
 select * into c from public.fitness_challenges where id=cid for update;
 select verified_runs into member_runs from public.fitness_members where challenge_id=cid and user_id=me;
 if c.id is null or member_runs is null then raise exception 'Join this challenge first.'; end if;
 if kind='start' then
   if c.host_id<>me then raise exception 'Only the host can start.'; end if;
   if c.status<>'lobby' then raise exception 'This challenge has already started.'; end if;
   select count(*) into n from public.fitness_members where challenge_id=cid;
   if n<2 then raise exception 'Invite at least one friend before starting.'; end if;
   update public.fitness_challenges set status='active',starts_at=now(),ends_at=now()+interval '7 days' where id=cid;
 elsif kind='vote' then
   if c.mode<>'party' or c.status<>'lobby' or c.replacement_used then raise exception 'Goal replacement is closed.'; end if;
   if not me=any(c.replacement_votes) then c.replacement_votes:=array_append(c.replacement_votes,me); end if;
   select count(*) into n from public.fitness_members where challenge_id=cid;
   update public.fitness_challenges set replacement_votes=c.replacement_votes,
   replacement_used=cardinality(c.replacement_votes)>n/2,
   minimum_distance_meters=case when cardinality(c.replacement_votes)>n/2 then c.minimum_distance_meters+250 else c.minimum_distance_meters end where id=cid;
 elsif kind='addRun' then
   if length(coalesce(p_action->>'requestId','')) not between 1 and 100 then raise exception 'Missing activity request ID.'; end if;
   if exists(select 1 from public.fitness_runs where request_id=p_action->>'requestId' and user_id=me and challenge_id=cid) then return cid; end if;
   if c.status<>'active' or c.ends_at<=now() then raise exception 'This challenge is no longer accepting activity.'; end if;
   if member_runs>=c.required_runs then raise exception 'Your goal is already complete.'; end if;
   insert into public.fitness_runs(challenge_id,user_id,distance_meters,duration_seconds,request_id) values(cid,me,c.minimum_distance_meters,round(c.minimum_distance_meters*.42),p_action->>'requestId');
   update public.fitness_members set verified_runs=verified_runs+1 where challenge_id=cid and user_id=me;
 elsif kind='settle' then
   if c.status='settled' then return cid; end if;
   if c.status<>'active' then raise exception 'Start the challenge first.'; end if;
   if c.ends_at>now() and c.host_id<>me then raise exception 'Only the host can fast-forward the demo.'; end if;
   perform public.fitness_settle_internal(cid);
 else raise exception 'This action is not supported.';
 end if;
 return cid;
end $$;
revoke all on function public.fitness_snapshot(), public.fitness_find_party(text), public.fitness_action(jsonb) from public,anon;
grant execute on function public.fitness_snapshot(), public.fitness_find_party(text), public.fitness_action(jsonb) to authenticated;


