create or replace function public.fitness_settle_internal(p_id uuid) returns void
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
