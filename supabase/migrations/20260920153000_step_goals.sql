-- Step-goal challenges: the user picks a daily step goal and a number of days.
-- Deposits are all-or-nothing: the full pledge comes back only once every
-- required day is complete, however many calendar days that takes. Unfinished
-- pledges go to charity when the challenge ends.
alter table public.fitness_challenges
 drop column difficulty, drop column required_runs, drop column minimum_distance_meters,
 drop column replacement_used, drop column replacement_votes,
 add column daily_step_goal integer not null default 10000 check(daily_step_goal between 1000 and 50000),
 add column required_days integer not null default 15 check(required_days between 1 and 60);
alter table public.fitness_members rename column verified_runs to completed_days;
alter table public.fitness_runs rename to fitness_days;
alter table public.fitness_days drop column distance_meters, drop column duration_seconds, add column steps integer not null default 0;

create or replace function public.fitness_settle_internal(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.fitness_challenges; m record; charity integer := 0; v_payouts jsonb := '[]';
begin
 select * into c from public.fitness_challenges where id=p_id for update;
 if c.status <> 'active' then return; end if;
 for m in select * from public.fitness_members where challenge_id=p_id order by joined_at,user_id loop
   if m.completed_days>=c.required_days then
     v_payouts := v_payouts || jsonb_build_array(jsonb_build_object('userId',m.user_id,'pledgeReturnedMinor',c.pledge_minor,'totalMinor',c.pledge_minor));
   else
     v_payouts := v_payouts || jsonb_build_array(jsonb_build_object('userId',m.user_id,'pledgeReturnedMinor',0,'totalMinor',0));
     charity := charity + c.pledge_minor;
   end if;
 end loop;
 update public.fitness_challenges set status='settled',ends_at=least(coalesce(ends_at,now()),now()),charity_minor=charity,payouts=v_payouts where id=p_id;
end $$;

create or replace function public.fitness_challenge_json(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'mode',c.mode,'dailyStepGoal',c.daily_step_goal,
 'requiredDays',c.required_days,'pledgeMinor',c.pledge_minor,'currency','CAD','hostId',c.host_id,'groupId',c.group_id,
 'status',c.status,'createdAt',c.created_at,'startsAt',c.starts_at,'endsAt',c.ends_at,'inviteCode',case when c.mode='party' then c.invite_code else '' end,
 'payouts',c.payouts,'charityMinor',c.charity_minor,
 'participants',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'completedDays',m.completed_days) order by m.joined_at,m.user_id) from public.fitness_members m where m.challenge_id=c.id),'[]'))
 from public.fitness_challenges c where c.id=p_id
$$;

create or replace function public.fitness_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null then raise exception 'Sign in first.'; end if;
 return jsonb_build_object('version',1,'hasEntered',true,'currentUserId',me,
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'initials',upper(left(p.display_name,1)),'color','#DDEAA4')) from public.profiles p),'[]'),
 'challenges',coalesce((select jsonb_agg(public.fitness_challenge_json(c.id) order by c.created_at desc) from public.fitness_challenges c where exists(select 1 from public.fitness_members m where m.challenge_id=c.id and m.user_id=me) or (c.mode='party' and exists(select 1 from public.fitness_group_members gm where gm.group_id=c.group_id and gm.user_id=me))),'[]'),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description','A shared goal. A little accountability.','inviteCode',g.invite_code,'color','#E7EDD5','memberIds',(select jsonb_agg(gm.user_id) from public.fitness_group_members gm where gm.group_id=g.id))) from public.fitness_groups g where exists(select 1 from public.fitness_group_members gm where gm.group_id=g.id and gm.user_id=me)),'[]'),
 'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'challengeId',r.challenge_id,'userId',r.user_id,'steps',r.steps,'completedAt',r.completed_at,'verification','verified','countsTowardGoal',true,'source','demo') order by r.completed_at desc) from public.fitness_days r where r.user_id=me),'[]'));
end $$;

create or replace function public.fitness_action(p_action jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); kind text:=p_action->>'type'; cid uuid; gid uuid; c public.fitness_challenges; n integer; step_goal integer; days integer; mode text; pledge integer; member_days integer;
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
   mode:=coalesce(p_action->'input'->>'mode','party'); pledge:=(p_action->'input'->>'pledgeMinor')::integer;
   step_goal:=(p_action->'input'->>'dailyStepGoal')::integer; days:=(p_action->'input'->>'requiredDays')::integer;
   if step_goal is null or step_goal not between 1000 and 50000 or days is null or days not between 1 and 60
     or mode not in ('solo','party') or pledge is null or pledge not in (500,1000,2000) then raise exception 'Choose a valid goal and pledge.'; end if;
   gid:=nullif(p_action->'input'->>'groupId','')::uuid;
   if mode='solo' then gid:=null; end if;
   if gid is not null and not exists(select 1 from public.fitness_group_members where group_id=gid and user_id=me) then raise exception 'Join this group first.'; end if;
   insert into public.fitness_challenges(title,mode,daily_step_goal,required_days,pledge_minor,host_id,group_id,status,starts_at,ends_at)
   values(case when mode='solo' then 'My step promise' else 'Our step promise' end,mode,step_goal,days,pledge,me,gid,
   case when mode='solo' then 'active' else 'lobby' end,case when mode='solo' then now() end,case when mode='solo' then now()+days*interval '1 day' end) returning id into cid;
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
 select completed_days into member_days from public.fitness_members where challenge_id=cid and user_id=me;
 if c.id is null or member_days is null then raise exception 'Join this challenge first.'; end if;
 if kind='start' then
   if c.host_id<>me then raise exception 'Only the host can start.'; end if;
   if c.status<>'lobby' then raise exception 'This challenge has already started.'; end if;
   select count(*) into n from public.fitness_members where challenge_id=cid;
   if n<2 then raise exception 'Invite at least one friend before starting.'; end if;
   update public.fitness_challenges set status='active',starts_at=now(),ends_at=now()+c.required_days*interval '1 day' where id=cid;
 elsif kind='addDay' then
   if length(coalesce(p_action->>'requestId','')) not between 1 and 100 then raise exception 'Missing activity request ID.'; end if;
   if exists(select 1 from public.fitness_days where request_id=p_action->>'requestId' and user_id=me and challenge_id=cid) then return cid; end if;
   if c.status<>'active' then raise exception 'This challenge is no longer accepting activity.'; end if;
   if member_days>=c.required_days then raise exception 'Your goal is already complete.'; end if;
   insert into public.fitness_days(challenge_id,user_id,steps,request_id) values(cid,me,c.daily_step_goal,p_action->>'requestId');
   update public.fitness_members set completed_days=completed_days+1 where challenge_id=cid and user_id=me;
   if not exists(select 1 from public.fitness_members where challenge_id=cid and completed_days<c.required_days) then
     perform public.fitness_settle_internal(cid);
   end if;
 elsif kind='settle' then
   if c.status='settled' then return cid; end if;
   if c.status<>'active' then raise exception 'Start the challenge first.'; end if;
   if c.host_id<>me then raise exception 'Only the host can end the challenge early.'; end if;
   perform public.fitness_settle_internal(cid);
 else raise exception 'This action is not supported.';
 end if;
 return cid;
end $$;
