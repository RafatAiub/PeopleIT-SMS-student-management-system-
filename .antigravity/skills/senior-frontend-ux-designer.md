# Skill: Senior Frontend UI/UX Design System & Component Architecture

> **Role:** You are a senior UI/UX developer AND designer working on PeopleIT SMS.
> Your mandate is to make every screen feel like a premium $50k SaaS product —
> not a school project. Every pixel, animation, and interaction must reflect that standard.

---

## 1. Design Philosophy — The Five Pillars

Every component, page, and interaction you build MUST satisfy all five:

| Pillar | Rule |
|---|---|
| **Clarity** | A user should understand what any screen does within 2 seconds of seeing it. No guesswork. |
| **Density without Clutter** | Education dashboards are data-heavy. Show MORE information using visual hierarchy, NOT by adding whitespace. |
| **Alive, Not Static** | Every surface must respond to the user. Hover states, focus rings, micro-animations, skeleton loaders — never a dead screen. |
| **Consistency** | Zero visual drift. Every card, button, badge, and table must use the design system tokens — never ad-hoc hex codes or magic-number spacing. |
| **Mobile-First, Desktop-Polished** | Touch targets ≥ 44px on mobile. Layouts reflow gracefully. Desktop gets richer interactions (hover tooltips, keyboard shortcuts). |

---

## 2. Color System — Strict Token Usage

### ✅ REQUIRED — Use only design tokens from `tailwind.config.js`

The project defines three semantic color scales. Never use raw Tailwind colors (`blue-500`, `green-400`). Always map to:

```
primary-*   → Brand actions, active states, focus rings, CTAs   (Indigo scale)
accent-*    → Success states, positive trends, secondary CTAs   (Teal scale)
surface-*   → Backgrounds, borders, text hierarchy              (Slate scale)
```

```tsx
// ❌ WRONG — raw Tailwind colors break visual consistency
<button className="bg-blue-600 hover:bg-blue-500 text-white">Save</button>
<span className="text-green-400">Active</span>

// ✅ CORRECT — mapped to project design tokens
<button className="btn-primary">Save</button>
<span className="text-accent-400">Active</span>
```

### ✅ REQUIRED — Semantic status colors only through badges

| Status | Class | Use Case |
|---|---|---|
| Success / Active / Paid | `badge-success` | Active students, paid invoices, present |
| Warning / Partial / Late | `badge-warning` | Partial payments, late attendance, medium risk |
| Danger / Failed / Absent | `badge-danger` | Absent, failed, high risk, overdue |
| Info / Pending / Default | `badge-info` | Pending actions, info states |
| Neutral / Inactive | `badge-neutral` | Disabled, archived, inactive |

---

## 3. Typography — Visual Hierarchy Rules

### ✅ REQUIRED — Follow the heading scale

| Element | Classes | Usage |
|---|---|---|
| Page Title | `text-2xl sm:text-3xl font-bold text-white` | One per page, top-left |
| Page Subtitle | `text-sm text-slate-400 mt-1` | Description below page title |
| Section Header | `text-lg font-semibold text-white` | Card headers, section dividers |
| Card Label | `text-sm text-slate-400` | KPI card labels, field labels |
| Body Text | `text-sm text-slate-300` | Table cells, descriptions |
| Caption / Muted | `text-xs text-slate-500` | Timestamps, helper text, footnotes |

### ✅ REQUIRED — Page headers follow this anatomy

```tsx
// ✅ CORRECT — Every page starts with this structure
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
  <div>
    <h1 className="text-2xl sm:text-3xl font-bold text-white">
      Students
    </h1>
    <p className="text-sm text-slate-400 mt-1">
      Manage student profiles, admissions, and records
    </p>
  </div>
  <div className="flex items-center gap-3">
    {/* Action buttons: filters, export, create */}
    <button className="btn-secondary">
      <Download className="w-4 h-4" /> Export
    </button>
    <button className="btn-primary">
      <Plus className="w-4 h-4" /> Add Student
    </button>
  </div>
</div>
```

---

## 4. Glass Card System — The Foundation Surface

Every content group (KPIs, tables, forms, charts) MUST be wrapped in a glass card. Never render content directly on the page background.

### ✅ REQUIRED — Card variants and usage

```tsx
// Static content (tables, charts, info panels)
<div className="glass-card p-5">
  {/* content */}
</div>

// Interactive / clickable cards (KPI cards, nav cards)
<div className="glass-card-hover p-5 cursor-pointer">
  {/* content */}
</div>

// ❌ WRONG — naked content on page background
<div className="p-4">
  <table>...</table>
</div>
```

### ✅ REQUIRED — Card header pattern

```tsx
<div className="glass-card overflow-hidden">
  {/* Card Header */}
  <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
    <h2 className="text-lg font-semibold text-white">Recent Students</h2>
    <button className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
      View All →
    </button>
  </div>
  {/* Card Body */}
  <div className="p-5">
    {/* Table or content */}
  </div>
</div>
```

---

## 5. Motion & Micro-Animation — Make It Alive

### ✅ REQUIRED — Every page-level component uses staggered entrance

```tsx
// ✅ CORRECT — Stagger children for premium feel
<div className="space-y-6">
  <div className="animate-fadeIn" style={{ animationDelay: '0ms' }}>
    {/* Page Header */}
  </div>
  <div className="animate-fadeIn" style={{ animationDelay: '60ms' }}>
    {/* KPI Row */}
  </div>
  <div className="animate-fadeIn" style={{ animationDelay: '120ms' }}>
    {/* Main Table */}
  </div>
</div>
```

### ✅ REQUIRED — Transition classes on all interactive elements

Every button, link, card, and input MUST have `transition-all duration-200` or equivalent.

```tsx
// ❌ WRONG — no transition, feels "dead" on hover
<button className="bg-indigo-600 hover:bg-indigo-500">Click</button>

// ✅ CORRECT — smooth transition
<button className="bg-indigo-600 hover:bg-indigo-500 transition-all duration-200 active:scale-95">
  Click
</button>
```

### ✅ REQUIRED — Skeleton loaders, NEVER blank screens

While data is loading, show skeleton placeholders that match the final layout shape.

```tsx
// ✅ CORRECT — skeleton while loading
{isLoading ? (
  <div className="space-y-3">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="h-12 rounded-lg shimmer-bg" />
    ))}
  </div>
) : (
  <DataTable ... />
)}

// ❌ WRONG — just a spinner with no layout context
{isLoading && <LoadingSpinner />}
```

---

## 6. Responsive Layout System

### ✅ REQUIRED — Grid breakpoints for dashboard layouts

```tsx
// ✅ CORRECT — KPI row adapts from 1-col mobile to 4-col desktop
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <KpiCard ... />
  <KpiCard ... />
  <KpiCard ... />
  <KpiCard ... />
</div>

// ✅ CORRECT — Two-column layouts collapse on mobile
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">{/* Main content */}</div>
  <div>{/* Sidebar/secondary content */}</div>
</div>
```

### ✅ REQUIRED — Tables must scroll horizontally on mobile

```tsx
// ✅ CORRECT — horizontal scroll wrapper
<div className="overflow-x-auto -mx-5 px-5">
  <table className="w-full min-w-[600px]">
    ...
  </table>
</div>
```

### ✅ REQUIRED — Touch targets

All clickable elements on mobile must have minimum `h-10 min-w-[40px]` (40px) touch areas.

---

## 7. Form Design — The Make-or-Break Surface

Forms are the most common interaction surface in an SMS. They MUST feel effortless.

### ✅ REQUIRED — Use `input-field` class for all inputs

```tsx
// ✅ CORRECT
<input
  type="text"
  className="input-field"
  placeholder="Enter student name"
  {...register('firstName')}
/>

// ❌ WRONG — inline ad-hoc styling
<input className="border p-2 rounded bg-gray-800 text-white" />
```

### ✅ REQUIRED — Error state pattern for form fields

```tsx
// ✅ CORRECT — field with validation error
<div>
  <label className="text-sm text-slate-400 mb-1 block">First Name *</label>
  <input
    className={`input-field ${errors.firstName ? 'border-red-500/50 focus:ring-red-500' : ''}`}
    {...register('firstName')}
  />
  {errors.firstName && (
    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" />
      {errors.firstName.message}
    </p>
  )}
</div>
```

### ✅ REQUIRED — Modal forms use slide-in overlay pattern

```tsx
// ✅ CORRECT — modal backdrop with glass panel
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
  <div className="relative glass-card w-full max-w-lg p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
    <h2 className="text-xl font-bold text-white mb-6">Add New Student</h2>
    {/* Form fields */}
    <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/5">
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" type="submit">Save Student</button>
    </div>
  </div>
</div>
```

---

## 8. Data Table Excellence

The `DataTable` component is the most-used component in the system. It MUST feel premium.

### ✅ REQUIRED — Table visual rules

| Element | Requirement |
|---|---|
| Header row | `bg-white/3` background, `text-xs uppercase tracking-wider text-slate-400 font-semibold` |
| Rows | Alternating subtle hover `hover:bg-white/3`, no zebra stripes |
| Row borders | `border-b border-white/5` — never heavy borders |
| Active sort column | Highlight header with `text-white` + directional arrow icon |
| Empty state | Show `EmptyState` component with contextual icon and action button |
| Pagination | Bottom bar inside the card, showing `Showing X-Y of Z` + page controls |

### ✅ REQUIRED — Action column pattern

```tsx
// ✅ CORRECT — icon-only actions with tooltips in a row
<td className="table-cell">
  <div className="flex items-center gap-1">
    <button
      title="Edit"
      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button
      title="Delete"
      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
</td>
```

---

## 9. Dashboard KPI & Chart Design

### ✅ REQUIRED — KPI cards follow the existing `KpiCard` component

Never build ad-hoc stat boxes. Always use the `KpiCard` component with:
- Animated counter (`useAnimatedCounter`)
- Trend indicator (up/down with colored pill)
- Icon with colored background container
- Mini sparkline bar at bottom

### ✅ REQUIRED — Chart containers

```tsx
// ✅ CORRECT — chart inside a glass card with proper header
<div className="glass-card p-5">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-white">Attendance Trends</h3>
    <select className="input-field w-auto text-xs py-1 px-2">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
    </select>
  </div>
  <div className="h-64">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        {/* Recharts config using design tokens */}
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>
```

### ✅ REQUIRED — Recharts theme constants

```tsx
// ✅ CORRECT — always use these colors in charts
const CHART_THEME = {
  primary:   '#4F46E5',  // primary-600
  accent:    '#0D9488',  // accent-600
  warning:   '#F59E0B',  // amber-500
  danger:    '#F43F5E',  // rose-500
  grid:      'rgba(255,255,255,0.05)',
  axisText:  '#64748B',  // surface-500
  tooltip: {
    bg:      '#1E293B',  // surface-800
    border:  'rgba(255,255,255,0.1)',
    text:    '#F1F5F9',
  },
};
```

---

## 10. Empty, Error & Edge States — Zero Dead Ends

### ✅ REQUIRED — Every list/table/page handles all 4 states

| State | Treatment |
|---|---|
| **Loading** | Skeleton loader matching the final layout shape |
| **Empty** | `EmptyState` component with contextual icon, description, and action CTA |
| **Error** | Red-bordered glass-card with retry button and user-friendly message |
| **Success** | `react-hot-toast` notification (top-right, dark theme, 3s auto-dismiss) |

```tsx
// ✅ CORRECT — error state inside a card
{isError && (
  <div className="glass-card border-red-500/20 p-8 text-center">
    <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
    <h3 className="text-lg font-semibold text-white mb-2">Failed to load students</h3>
    <p className="text-sm text-slate-400 mb-4">{error?.message || 'An unexpected error occurred'}</p>
    <button className="btn-primary" onClick={() => refetch()}>
      <RefreshCw className="w-4 h-4" /> Try Again
    </button>
  </div>
)}
```

---

## 11. Accessibility (a11y) — Non-Negotiable

| Rule | Implementation |
|---|---|
| Focus visible | All interactive elements: `focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900` |
| Screen reader labels | All icon-only buttons: `title="..."` AND `aria-label="..."` |
| Color contrast | Text on dark surfaces must meet WCAG AA (4.5:1 ratio minimum) |
| Keyboard navigation | Modals trap focus. Escape closes modals. Tab order is logical. |
| Form labels | Every input has a visible `<label>` or `aria-label`. Never rely on placeholder alone. |
| Role indicators | Status badges include `role="status"`. Alerts include `role="alert"`. |

---

## 12. Icon Usage — Lucide React Only

### ✅ REQUIRED — All icons from `lucide-react`

```tsx
// ✅ CORRECT
import { Users, Plus, Search, ChevronDown } from 'lucide-react';

// ❌ WRONG — mixing icon libraries
import { FaUsers } from 'react-icons/fa';
import { MdAdd } from 'react-icons/md';
```

### ✅ REQUIRED — Icon sizing convention

| Context | Size Class | Example |
|---|---|---|
| Inline with text | `w-4 h-4` | Buttons, badges, breadcrumbs |
| Sidebar nav items | `w-4.5 h-4.5` | Navigation links |
| Card feature icons | `w-5 h-5` | Inside icon containers |
| Empty state / hero | `w-8 h-8` to `w-12 h-12` | Centered illustrations |

---

## 13. Performance Rules

| Rule | Requirement |
|---|---|
| **Code splitting** | Every page component MUST be `React.lazy()` imported in `App.tsx` |
| **Image optimization** | All images use `loading="lazy"` and explicit `width`/`height` |
| **List virtualization** | Lists with > 50 rows MUST use `@tanstack/react-virtual` |
| **Memoization** | Expensive filter/sort computations wrapped in `useMemo` |
| **Debounced search** | All search inputs debounced at 300ms minimum before firing API calls |
| **Bundle awareness** | Never import entire libraries. Use tree-shakeable named imports. |

```tsx
// ✅ CORRECT — debounced search input
const [search, setSearch] = useState('');
const debouncedSearch = useMemo(() => {
  let timeout: NodeJS.Timeout;
  return (value: string) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => setSearch(value), 300);
  };
}, []);
```

---

## Prohibited Patterns

| Pattern | Why It Fails |
|---|---|
| Raw hex codes (`#3B82F6`) in component JSX | Breaks design system consistency. Use Tailwind tokens. |
| `alert()` or `window.confirm()` | Ugly native dialogs. Use `ConfirmModal` or `react-hot-toast`. |
| Console errors visible in production | All `console.log` must be removed or gated behind `NODE_ENV` |
| Static text like "Loading..." without skeleton | Makes the app feel broken and slow. Always show layout-aware skeletons. |
| Inline `style={{}}` for colors, spacing, or layout | Breaks Tailwind purging and design system. Only use for truly dynamic values (chart widths, animation delays). |
| Disabled buttons with no visual explanation | Always show a tooltip or helper text explaining WHY something is disabled. |
| Tables without empty/error states | Dead-end UX. Every data surface handles all four states (loading, empty, error, success). |
| Unlabeled icon-only buttons | Accessibility failure. Every icon button needs `title` + `aria-label`. |

---

## Component Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Pages | PascalCase, descriptive | `StudentList.tsx`, `AdminDashboard.tsx` |
| Reusable components | PascalCase, generic | `DataTable.tsx`, `KpiCard.tsx`, `EmptyState.tsx` |
| Hooks | camelCase, `use` prefix | `useStudents.ts`, `useAuth.ts` |
| Stores | camelCase, `Store` suffix | `authStore.ts`, `uiStore.ts` |
| API modules | camelCase, `.api.ts` suffix | `students.api.ts`, `fees.api.ts` |
| Style files | lowercase, `.css` extension | `index.css` (single global entry point) |

---

## The Golden Test

Before marking ANY frontend work as complete, ask yourself:

1. **Would a school administrator in Bangladesh understand this screen without training?**
2. **Does it look like Notion, Linear, or Vercel Dashboard — or does it look like a Bootstrap template?**
3. **Does every interactive element respond to hover, focus, and active states?**
4. **Is the mobile experience functional and beautiful, not just "not broken"?**
5. **Would I be proud to show this in a product demo to an investor?**

If the answer to ANY of these is "no" — the work is not finished.
