/**
 * Editor pickers used as custom fields by CollectionList (collection, relation,
 * field names). They read the registry from `EditorBindContext`, so they only
 * render inside the page editor; no Puck runtime import (public bundle stays light).
 */
import type { CustomField, CustomFieldRender } from '@puckeditor/core';
import { publicCollections, type CollectionFieldMeta, type CollectionMeta } from '../collections';
import { useEditorBind, type EditorBindValue } from './bindContext';

const selectCls = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900';

/** The collection a CollectionList (the selected block) lists: its own, or the target of its relation. */
export function listCollection(ed: EditorBindValue | null): CollectionMeta | null {
  if (!ed) return null;
  const props = ed.selectedProps();
  if (!props) return null;
  const all = publicCollections(ed.collections);
  if (props.sourceKind === 'relation') {
    const rel = ed.scopeForSelected().item?.relations.find((r) => r.key === props.relation);
    return rel?.collection ? all.find((c) => c.key === rel.collection) ?? null : null;
  }
  return all.find((c) => c.key === props.collection) ?? null;
}

const CollectionPicker: CustomFieldRender<string | undefined> = ({ value, onChange, readOnly }) => {
  const ed = useEditorBind();
  const list = publicCollections(ed?.collections);
  return (
    <select aria-label="Collection" className={selectCls} disabled={readOnly} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">— choose —</option>
      {list.map((c) => (
        <option key={c.key} value={c.key} disabled={!c.available}>{c.labelPlural}{c.available ? '' : ` (${c.unavailableReason || 'switched off'})`}</option>
      ))}
    </select>
  );
};
export const collectionPickerField = (label: string): CustomField<string | undefined> => ({ type: 'custom', label, render: CollectionPicker });

const RelationPicker: CustomFieldRender<string | undefined> = ({ value, onChange, readOnly }) => {
  const ed = useEditorBind();
  const rels = ed?.scopeForSelected().item?.relations ?? [];
  return (
    <>
      <select aria-label="Relation" className={selectCls} disabled={readOnly} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose —</option>
        {rels.map((r) => <option key={r.key} value={r.key}>{r.label}{r.collection ? '' : ' (nested data)'}</option>)}
      </select>
      {!rels.length && <p className="mt-1 text-xs text-slate-500">Nothing to choose here: this list is not inside a collection item or template page that has related data.</p>}
    </>
  );
};
export const relationPickerField = (label: string): CustomField<string | undefined> => ({ type: 'custom', label, render: RelationPicker });

type FieldUse = 'filter' | 'sort';

function makeFieldPicker(use: FieldUse): CustomFieldRender<string | undefined> {
  const Picker: CustomFieldRender<string | undefined> = ({ value, onChange, readOnly }) => {
    const ed = useEditorBind();
    const meta = listCollection(ed);
    const fields: CollectionFieldMeta[] = (meta?.fields ?? []).filter((f) => (use === 'filter' ? f.filter.length > 0 : f.sortable));
    return (
      <select aria-label="Field" className={selectCls} disabled={readOnly} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{use === 'sort' ? '(default order)' : '— choose —'}</option>
        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
    );
  };
  return Picker;
}
export const filterFieldPicker = (label: string): CustomField<string | undefined> => ({ type: 'custom', label, render: makeFieldPicker('filter') });
export const sortFieldPicker = (label: string): CustomField<string | undefined> => ({ type: 'custom', label, render: makeFieldPicker('sort') });
