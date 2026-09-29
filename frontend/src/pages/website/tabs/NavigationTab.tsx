import React from 'react';
import { ArrowDown, ArrowUp, GripVertical, IndentIncrease, IndentDecrease, Plus, Save, Trash2, Menu as MenuIcon, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useUpdateSite } from '../sites.queries';
import { pagePath } from '../siteUtils';
import type { NavItem, SiteMeResponse, SiteNavigation, SitePageSummary } from '../sites.types';

type Path = [number] | [number, number];

const clone = (items: NavItem[]): NavItem[] => items.map((i) => ({ ...i, children: i.children ? clone(i.children) : undefined }));

function siblings(items: NavItem[], path: Path): NavItem[] {
  return path.length === 1 ? items : (items[path[0]].children ??= []);
}

/** Move within the same sibling list. */
function move(items: NavItem[], path: Path, to: number): NavItem[] {
  const next = clone(items);
  const list = siblings(next, path);
  const from = path[path.length - 1];
  if (to < 0 || to >= list.length || to === from) return items;
  const [it] = list.splice(from, 1);
  list.splice(to, 0, it);
  return next;
}

function indent(items: NavItem[], path: Path): NavItem[] {
  if (path.length !== 1 || path[0] === 0) return items;
  const next = clone(items);
  const [it] = next.splice(path[0], 1);
  const parent = next[path[0] - 1];
  // Menus nest one level only; an item's own children come up with it.
  parent.children = [...(parent.children ?? []), { ...it, children: undefined }, ...(it.children ?? [])];
  return next;
}

function outdent(items: NavItem[], path: Path): NavItem[] {
  if (path.length !== 2) return items;
  const next = clone(items);
  const parent = next[path[0]];
  const [it] = (parent.children ?? []).splice(path[1], 1);
  if (parent.children && parent.children.length === 0) parent.children = undefined;
  next.splice(path[0] + 1, 0, it);
  return next;
}

function update(items: NavItem[], path: Path, patch: Partial<NavItem>): NavItem[] {
  const next = clone(items);
  const list = siblings(next, path);
  list[path[path.length - 1]] = { ...list[path[path.length - 1]], ...patch };
  return next;
}

function remove(items: NavItem[], path: Path): NavItem[] {
  const next = clone(items);
  const list = siblings(next, path);
  list.splice(path[path.length - 1], 1);
  if (path.length === 2 && list.length === 0) next[path[0]].children = undefined;
  return next;
}

const ItemRow: React.FC<{
  item: NavItem;
  path: Path;
  count: number;
  pages: SitePageSummary[];
  onChange: (fn: (items: NavItem[]) => NavItem[]) => void;
  drag: { from: Path | null; setFrom: (p: Path | null) => void };
}> = ({ item, path, count, pages, onChange, drag }) => {
  const t = useT();
  const idx = path[path.length - 1];
  const key = path.join('-');
  const pageMatch = pages.find((p) => pagePath(p.slug) === item.href);
  const [over, setOver] = React.useState(false);
  const [grab, setGrab] = React.useState(false);
  const sameList = (a: Path | null) => !!a && a.length === path.length && (path.length === 1 || a[0] === path[0]);

  return (
    <div
      className={cn(
        'rounded-lg border bg-white dark:bg-white/3 p-3 transition-colors',
        over ? 'border-primary-500' : 'border-slate-200 dark:border-white/10',
        path.length === 2 && 'ml-6 sm:ml-10'
      )}
      // Only the grip starts a drag, so selecting text inside the inputs still works.
      draggable={grab}
      onDragStart={(e) => {
        e.stopPropagation();
        drag.setFrom(path);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        drag.setFrom(null);
        setGrab(false);
      }}
      onDragOver={(e) => {
        if (sameList(drag.from)) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (drag.from && sameList(drag.from)) onChange((items) => move(items, drag.from as Path, idx));
        drag.setFrom(null);
      }}
    >
      <div className="flex flex-col md:flex-row md:items-end gap-2">
        <span
          className="hidden md:flex self-center cursor-grab text-slate-400"
          aria-hidden
          title={t('Drag to reorder')}
          onMouseDown={() => setGrab(true)}
          onMouseUp={() => setGrab(false)}
        >
          <GripVertical className="w-4 h-4" />
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[1fr_1fr_1.4fr] gap-2 flex-1 min-w-0">
          <Input id={`nav-${key}-label`} label={t('Label')} value={item.label} onChange={(e) => onChange((it) => update(it, path, { label: e.target.value }))} />
          <Input id={`nav-${key}-labelBn`} label={t('Label (Bangla)')} lang="bn" value={item.labelBn ?? ''} onChange={(e) => onChange((it) => update(it, path, { labelBn: e.target.value || undefined }))} />
          <div className="flex flex-col sm:col-span-2 md:col-span-1">
            <label htmlFor={`nav-${key}-href`} className="field-label">{t('Link')}</label>
            <div className="flex gap-2">
              <select
                aria-label={t('Link to a page')}
                className="input-field w-36 shrink-0"
                value={pageMatch ? pagePath(pageMatch.slug) : '__custom'}
                onChange={(e) => e.target.value !== '__custom' && onChange((it) => update(it, path, { href: e.target.value }))}
              >
                {pages.map((p) => <option key={p.id} value={pagePath(p.slug)}>{p.title}</option>)}
                <option value="/blog">{t('News / Blog')}</option>
                <option value="__custom">{t('Custom link')}</option>
              </select>
              <input id={`nav-${key}-href`} className="input-field min-w-0 flex-1" value={item.href} onChange={(e) => onChange((it) => update(it, path, { href: e.target.value }))} placeholder="/about or https://" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move up')} disabled={idx === 0} onClick={() => onChange((it) => move(it, path, idx - 1))}><ArrowUp className="w-4 h-4" /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move down')} disabled={idx === count - 1} onClick={() => onChange((it) => move(it, path, idx + 1))}><ArrowDown className="w-4 h-4" /></Button>
          {path.length === 1 ? (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Nest under the item above')} title={t('Nest under the item above')} disabled={idx === 0} onClick={() => onChange((it) => indent(it, path))}><IndentIncrease className="w-4 h-4" /></Button>
          ) : (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t('Move out of the sub-menu')} title={t('Move out of the sub-menu')} onClick={() => onChange((it) => outdent(it, path))}><IndentDecrease className="w-4 h-4" /></Button>
          )}
          <Button type="button" size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Remove item')} onClick={() => onChange((it) => remove(it, path))}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
};

const MenuEditor: React.FC<{ items: NavItem[]; pages: SitePageSummary[]; onChange: (items: NavItem[]) => void; allowNesting: boolean }> = ({ items, pages, onChange, allowNesting }) => {
  const t = useT();
  const [from, setFrom] = React.useState<Path | null>(null);
  const apply = (fn: (items: NavItem[]) => NavItem[]) => onChange(fn(items));

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <EmptyState compact icon={<Link2 />} title={t('This menu is empty')} description={t('Add links to your pages or to other websites.')} />
      ) : (
        items.map((item, i) => (
          <div key={i} className="space-y-2">
            <ItemRow item={item} path={[i]} count={items.length} pages={pages} onChange={apply} drag={{ from, setFrom }} />
            {allowNesting &&
              item.children?.map((c, j) => (
                <ItemRow key={`${i}-${j}`} item={c} path={[i, j]} count={item.children!.length} pages={pages} onChange={apply} drag={{ from, setFrom }} />
              ))}
          </div>
        ))
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => onChange([...items, { label: t('New link'), href: '/' }])}>
          {t('Add link')}
        </Button>
        {pages
          .filter((p) => !items.some((i) => i.href === pagePath(p.slug)))
          .slice(0, 6)
          .map((p) => (
            <Button key={p.id} type="button" variant="ghost" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => onChange([...items, { label: p.title, labelBn: p.titleBn ?? undefined, href: pagePath(p.slug) }])}>
              {p.title}
            </Button>
          ))}
      </div>
    </div>
  );
};

export const NavigationTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const save = useUpdateSite();
  const init = React.useCallback((): SiteNavigation => ({ header: clone(me.site.navigation?.header ?? []), footer: clone(me.site.navigation?.footer ?? []) }), [me.site.navigation]);
  const [nav, setNav] = React.useState<SiteNavigation>(init);
  const [which, setWhich] = React.useState<'header' | 'footer'>('header');
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setNav(init());
    setDirty(false);
  }, [init]);

  const onSave = () => {
    const bad = [...nav.header, ...nav.footer, ...nav.header.flatMap((i) => i.children ?? []), ...nav.footer.flatMap((i) => i.children ?? [])].find((i) => !i.label.trim() || !i.href.trim());
    if (bad) {
      toast.error(t('Every menu item needs a label and a link.'));
      return;
    }
    save.mutate({ navigation: nav }, {
      onSuccess: () => {
        setDirty(false);
        toast.success(t('Menus saved. Publish the site to make them public.'));
      },
    });
  };

  return (
    <Card>
      <CardHeader
        icon={<MenuIcon className="w-4 h-4" />}
        title={t('Menus')}
        description={t('Drag items (or use the arrows) to reorder. Header items can have one level of sub-menu.')}
        actions={<Button onClick={onSave} isLoading={save.isPending} disabled={!dirty} leftIcon={<Save className="w-4 h-4" />}>{t('Save menus')}</Button>}
      />
      <Tabs
        variant="pills"
        idPrefix="nav-menu"
        label={t('Menu')}
        value={which}
        onChange={(v) => setWhich(v as 'header' | 'footer')}
        tabs={[
          { id: 'header', label: t('Header menu'), count: nav.header.length },
          { id: 'footer', label: t('Footer menu'), count: nav.footer.length },
        ]}
        className="mb-4"
      />
      <MenuEditor
        key={which}
        items={nav[which]}
        pages={me.pages}
        allowNesting={which === 'header'}
        onChange={(items) => {
          setNav((n) => ({ ...n, [which]: items }));
          setDirty(true);
        }}
      />
    </Card>
  );
};
