# Redesign — Engineer Brief (read before touching any screen)

PeopleNIT SMS is a multi-tenant school management SaaS for Bangladesh. Frontend: React 18, TypeScript, Vite, Tailwind v4, React Query 5, Zustand, and the axios `apiClient` in `src/api/client.ts`. Backend: Express, Prisma and PostgreSQL.

## Hard rules

1. **No backend or API changes** unless your task explicitly says otherwise. Use only existing endpoints and their existing response shapes. Read `backend/src/modules/<module>/*.routes.ts`, `*.dto.ts`, `*.service.ts` and `*.repository.ts` to confirm routes, query parameters and shapes before you rely on them.
2. **Keep all existing functionality.** That means every field, filter, validation rule, workflow step, permission check, export, modal and bulk action. Keep existing element `id` attributes (tests query them). Re-layout is fine; removal is not.
3. **Role-based access stays identical.** Route guards live in `frontend/src/App.tsx`, API guards in the backend routes. Hide actions a role can't perform. Never show something the backend will reject for that role.
4. **Never show fake or hard-coded data as real.** If something can't be wired to a real endpoint, render `<IncompleteNotice reason="…" />`. Demo modes (features that need an API key) must be labelled "Demo mode" with an `<Alert tone="warning">`.
5. **Every data view needs all three states.** Loading shows skeletons (`Skeleton`, `SkeletonStatGrid`, or DataTable's `isLoading`). Empty shows `<EmptyState>`. Error shows `<ErrorState onRetry>`. Never swallow a failure into an empty list.
6. **Mobile-first.** Every screen must be usable at 360px width with no horizontal page scroll. DataTable switches to cards on phones automatically.
7. **Only edit files you own** (listed in your task). Never edit:
   - `src/App.tsx`
   - `src/components/**` (the design system)
   - `src/styles/**`
   - `src/i18n/**`
   - `src/api/client.ts`

   If you need a route change or a shared component change, describe it in your final report. Helpers private to your screen go next to your files.
8. **Verify:**
   - `cd frontend && npx tsc --noEmit -p .` must show 0 errors in your files.
   - `npx eslint <your files>` must show 0 errors.
   - Do **not** run `vite build`, because other engineers share `dist`.
9. **Backend safety:** `backend/.env` points at the **production** database.
   - Never run jest, `prisma migrate`, `db push`, seed scripts, or anything else that connects to the database.
   - New schema changes, when a task allows them, go in `schema.prisma` plus a hand-written migration folder only. They are never applied.
10. **Finish your whole scope.** You have ample budget. Don't stop after the first item. If something truly can't be done, say exactly what and why.

## Design system (already built; use it, don't restyle from scratch)

```ts
import {
  Button, Card, CardHeader, Badge, Modal, Drawer, Input, Textarea, Select, Checkbox,
  Tabs, TabPanel, Skeleton, SkeletonText, SkeletonStatGrid, Dropdown, Alert, ErrorState,
  IncompleteNotice, UpgradePrompt, AiGeneratedNotice, PageHeader, StatCard, Avatar,
  Tooltip, Kbd, DescriptionList,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { PrintLayout, SignatureLines } from '@/components/print/PrintLayout';
import { AttendanceHeatmap } from '@/components/Charts/AttendanceHeatmap';
import { chartColors, chartAxis, chartGrid, chartTooltipStyle } from '@/lib/chartTheme';
import { useT, formatCurrency, formatNumber, formatDate } from '@/i18n';
```

- **Button**
  - Variants: `primary | secondary | outline | ghost | danger | danger-soft | link | gradient`.
  - Sizes: `xs | sm | md | lg | icon | icon-sm`.
  - Props: `leftIcon`, `rightIcon`, `isLoading`, `fullWidth`.
  - There is no default `type`, so inside a `<form>` it submits. Pass `type="button"` for non-submit buttons in forms.
- **Input / Select / Textarea:** `label`, `error` (inline error, sets `aria-invalid`), `helperText`, `required`. Select also takes `options` and `placeholder`.
- **Modal:** `isOpen`, `onClose`, `title`, `description`, `footer`, `size (sm|md|lg|xl|2xl|full)`. It has a focus trap and shows as a bottom sheet on phones. Without `title` or `footer` it's a padded free-form panel. Legacy usage with `className` still works.
- **Drawer:** `isOpen`, `onClose`, `title`, `description`, `footer`, `side`, `width (sm|md|lg|xl)`. Use it for quick view and quick edit.
- **Tabs / TabPanel:** keyboard-accessible. `tabs=[{id,label,count?,icon?}]`, `value`, `onChange`, `variant (underline|pills)`.
- **DataTable columns:** `{ key, header, accessor?, render?, sortable?, primary?, hideOnMobile?, defaultHidden?, exportValue?, align?: 'right' }`.
- **DataTable props:** `data`, `columns`, `actions`, `isLoading`, `serverPagination` + `totalCount` + `page` + `onPageChange` + `onPageSizeChange` + `pageSize`, `serverSearch` + `onSearch`, `selectable` + `onSelectionChange`, `bulkActions(selected, clear)`, `toolbar`, `exportFileName`, `onRowClick`, `emptyTitle`, `emptyDescription`, `emptyAction`.
- **StatCard:** `label`, `value`, `icon`, `tone`, `hint`, `trend?` (only pass a trend computed from real data), `to?`, `onClick?`.
- **PageHeader:** `title`, `description`, `breadcrumbs`, `actions`. Use it at the top of every page.
- **i18n**
  - Wrap every visible string: `const t = useT(); t('Students')`.
  - Money must use `formatCurrency` (BDT ৳ with lakh grouping). Dates use `formatDate`. Numbers use `formatNumber`.
  - Don't edit the dictionaries; the lead adds translations.
- **Colours** (Tailwind tokens)
  - `primary-*` is brand orange. Use 600 and up for text on white, and never put white text on `primary-500`.
  - `slate-*` for neutrals, `blue-*` for info, `emerald-*` for success, `amber-*` for warning, `red-*` for danger.
  - Surfaces: `<Card>` or the `glass-card` class.
- **Examples:** `src/pages/design-system/DesignSystem.tsx` shows every component in use.
- **Data fetching:** prefer React Query (`useQuery` with array keys, `useMutation` + `queryClient.invalidateQueries`) when you refactor a screen.
- **xlsx:** import it dynamically (`await import('xlsx')`) at the moment of use, never at the top of a module.
- **Large files:** split pages over about 600 lines into components in the same folder.
