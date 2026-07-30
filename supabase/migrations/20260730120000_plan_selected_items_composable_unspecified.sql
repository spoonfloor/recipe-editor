-- Direct plan selections can combine a numeric count with quantity_unspecified ("some").
-- Fix set_plan_item_quantity so p_quantity_unspecified survives when p_quantity > 0.

create or replace function catalog.set_plan_item_quantity(
  p_item_key text,
  p_quantity numeric,
  p_name text default null,
  p_variant_name text default null,
  p_ingredient_variant_id bigint default null,
  p_quantity_unspecified boolean default false
) returns jsonb
  language plpgsql
  set search_path = catalog, plan, list, public
as $$
declare
  v_doc_id              bigint;
  v_session_id          bigint;
  v_item_key            text := nullif(coalesce(p_item_key, ''), '');
  v_quantity            numeric := coalesce(p_quantity, 0);
  v_unspecified         boolean := coalesce(p_quantity_unspecified, false);
  v_existing_name       text;
  v_existing_variant    text;
  v_reset_source_key    text;
  v_updated_at          timestamptz;
  v_count               integer;
  v_reset_checked_count integer := 0;
begin
  if v_item_key is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_item_key');
  end if;

  select id into v_doc_id
    from plan.documents
   where slug = 'default'
   limit 1;

  if v_doc_id is null then
    insert into plan.documents (slug, title, status)
    values ('default', 'Default', 'active')
    returning id into v_doc_id;
  end if;

  if v_quantity <= 0 and not v_unspecified then
    select name, variant_name
      into v_existing_name, v_existing_variant
      from plan.selected_items
     where document_id = v_doc_id
       and item_key = v_item_key;

    delete from plan.selected_items
     where document_id = v_doc_id
       and item_key = v_item_key;
    get diagnostics v_count = row_count;

    select id into v_session_id
      from list.sessions
     where plan_document_id = v_doc_id
       and status = 'active'
     order by updated_at desc, id desc
     limit 1;

    if nullif(trim(coalesce(v_existing_name, '')), '') is not null then
      v_reset_source_key := lower(trim(v_existing_name));
      if nullif(trim(coalesce(v_existing_variant, '')), '') is not null
         and lower(trim(v_existing_variant)) <> 'default' then
        v_reset_source_key := v_reset_source_key || chr(30) || lower(trim(v_existing_variant));
      end if;
    end if;

    if v_session_id is not null then
      update list.row_overrides
         set checked = false,
             updated_at = now()
       where session_id = v_session_id
         and checked = true
         and source_key in (
           v_item_key,
           coalesce(v_reset_source_key, v_item_key)
         );
      get diagnostics v_reset_checked_count = row_count;

      if v_reset_checked_count > 0 then
        update list.sessions
           set updated_at = now()
         where id = v_session_id;
      end if;
    end if;

    v_updated_at := now();
    update plan.documents
       set updated_at = v_updated_at,
           version = version + 1
     where id = v_doc_id;

    return jsonb_build_object(
      'ok', true,
      'deleted', v_count > 0,
      'checked_reset_count', v_reset_checked_count,
      'updated_at', v_updated_at
    );
  end if;

  insert into plan.selected_items (
    document_id,
    item_key,
    ingredient_variant_id,
    name,
    variant_name,
    quantity,
    quantity_unspecified,
    updated_at
  )
  values (
    v_doc_id,
    v_item_key,
    p_ingredient_variant_id,
    coalesce(p_name, ''),
    coalesce(p_variant_name, ''),
    case when v_unspecified and v_quantity <= 0 then 0 else v_quantity end,
    v_unspecified,
    now()
  )
  on conflict (document_id, item_key) do update
    set quantity = excluded.quantity,
        quantity_unspecified = excluded.quantity_unspecified,
        ingredient_variant_id = coalesce(
          excluded.ingredient_variant_id,
          plan.selected_items.ingredient_variant_id
        ),
        name = case
                 when excluded.name <> '' then excluded.name
                 else plan.selected_items.name
               end,
        variant_name = case
                         when excluded.variant_name <> '' then excluded.variant_name
                         else plan.selected_items.variant_name
                       end,
        updated_at = now()
  returning updated_at into v_updated_at;

  update plan.documents
     set updated_at = now(),
         version = version + 1
   where id = v_doc_id;

  return jsonb_build_object(
    'ok', true,
    'deleted', false,
    'updated_at', v_updated_at
  );
end;
$$;
