-- Detach the live plan from the currently active named session without deleting it.

create or replace function catalog.close_active_plan_session()
returns jsonb
language plpgsql
set search_path = catalog, plan, public
as $$
declare
  v_doc_id bigint;
  v_resolved jsonb;
begin
  v_resolved := catalog.internal_resolve_default_plan_session();
  v_doc_id := nullif(v_resolved->>'documentId', '')::bigint;

  if v_doc_id is null then
    return jsonb_build_object('ok', true, 'activeNamedSnapshotId', null);
  end if;

  update plan.documents
     set active_named_snapshot_id = null,
         updated_at = now()
   where id = v_doc_id;

  return jsonb_build_object('ok', true, 'activeNamedSnapshotId', null);
end;
$$;

grant execute on function catalog.close_active_plan_session() to anon, authenticated;
