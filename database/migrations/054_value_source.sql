-- Where a contract value came from, when it was not in the structured notice.
alter table opportunities add column if not exists value_source text;
