create or replace function public.fitness_action(p_action jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
