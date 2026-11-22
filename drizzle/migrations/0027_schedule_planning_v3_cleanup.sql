-- lovable-cron-fallback-reviewed: physical purge of precise-location data must happen within ~15 min of its 1-hour TTL; reads already reject expired data inline, no row-change event fires at expiry time.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'planning-v3-private-cleanup';
SELECT cron.schedule('planning-v3-private-cleanup', '*/15 * * * *', 'SELECT public.party_plan_cleanup()');

CREATE OR REPLACE FUNCTION public.party_plan_cleanup_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'scheduled', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'planning-v3-private-cleanup' AND active AND command = 'SELECT public.party_plan_cleanup()'),
    'schedule', (SELECT schedule FROM cron.job WHERE jobname = 'planning-v3-private-cleanup'),
    'lastRun', (SELECT jsonb_build_object('status', d.status, 'endedAt', d.end_time) FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
                 WHERE j.jobname = 'planning-v3-private-cleanup' ORDER BY d.start_time DESC LIMIT 1)) $$;
REVOKE ALL ON FUNCTION public.party_plan_cleanup_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_plan_cleanup_status() TO service_role;