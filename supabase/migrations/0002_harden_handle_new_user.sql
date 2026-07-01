-- handle_new_user() soll nur vom Trigger laufen, nicht als öffentliche RPC
-- (behebt Security-Advisor-Warnungen 0028/0029).
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
