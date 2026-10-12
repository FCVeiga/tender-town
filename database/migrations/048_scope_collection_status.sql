-- Whether a scope's last collection finished, and when it last succeeded.
-- last_run_at stays the cadence clock and is only moved on success.
alter table scopes add column if not exists last_success_at timestamptz;
alter table scopes add column if not exists last_attempt_at timestamptz;
alter table scopes add column if not exists last_run_error text;

-- Existing last_run_at values were written only after a finished run.
update scopes set last_success_at = last_run_at
  where last_success_at is null and last_run_at is not null;
