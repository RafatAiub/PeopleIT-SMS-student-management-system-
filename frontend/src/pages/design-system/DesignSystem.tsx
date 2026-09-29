import React from 'react';
import toast from 'react-hot-toast';
import { Plus, Download, Users, Wallet, CalendarCheck, GraduationCap, Trash2, Pencil } from 'lucide-react';
import {
  Button, Card, CardHeader, Badge, Modal, Drawer, Input, Textarea, Select, Checkbox, Tabs, TabPanel,
  Skeleton, SkeletonStatGrid, Dropdown, Alert, ErrorState, IncompleteNotice, UpgradePrompt, AiGeneratedNotice,
  PageHeader, StatCard, Avatar, Tooltip, Kbd, DescriptionList,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { AttendanceHeatmap } from '@/components/Charts/AttendanceHeatmap';
import { PrintLayout, SignatureLines } from '@/components/print/PrintLayout';
import { formatCurrency, formatDate, formatNumber, useLocale, useT } from '@/i18n';

/**
 * Design system reference page (/design-system, Super Admin & Admin only,
 * not in the sidebar). Every example below uses clearly-labelled SAMPLE
 * content to demonstrate components; no screen in the product uses it.
 */

const SWATCHES: { name: string; hex: string; use: string; text?: string }[] = [
  { name: 'Primary', hex: '#F57722', use: 'Brand highlights, active nav, focus ring, charts. Never carries white text.' },
  { name: 'Primary 600', hex: '#C2550A', use: 'Buttons & links (darkened primary) — 4.57:1 with white', text: '#fff' },
  { name: 'Primary 700', hex: '#A3460B', use: 'Hover, small link text — 6.11:1', text: '#fff' },
  { name: 'Accent', hex: '#FF9D2A', use: 'Hover accents, badges, secondary chart series' },
  { name: 'Info', hex: '#67ADED', use: 'Info states, charts, links in dark mode' },
  { name: 'Info 600', hex: '#2A6DB5', use: 'Info text on white — 5.31:1', text: '#fff' },
  { name: 'Dark neutral', hex: '#393939', use: 'Body text, headings, sidebar — 11.55:1', text: '#fff' },
  { name: 'Light neutral', hex: '#D3D3D3', use: 'Borders, dividers, disabled only — never text' },
  { name: 'Success', hex: '#047857', use: 'Paid, present, approved — 5.48:1', text: '#fff' },
  { name: 'Warning', hex: '#B45309', use: 'Partial, late, pending — 5.02:1', text: '#fff' },
  { name: 'Danger', hex: '#DC2626', use: 'Unpaid, absent, destructive — 4.83:1', text: '#fff' },
];

interface SampleRow { id: string; name: string; klass: string; due: number; status: string }
const SAMPLE_ROWS: SampleRow[] = Array.from({ length: 23 }).map((_, i) => ({
  id: `s${i}`,
  name: `Sample Student ${i + 1}`,
  klass: `Class ${(i % 10) + 1} – ${'ABC'[i % 3]}`,
  due: [0, 1500, 3200, 0, 750][i % 5],
  status: ['PAID', 'PARTIAL', 'UNPAID', 'PAID', 'OVERDUE'][i % 5],
}));

const Section: React.FC<{ id: string; title: string; description?: string; children: React.ReactNode }> = ({ id, title, description, children }) => (
  <section id={id} className="scroll-mt-24 space-y-4">
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
    </div>
    {children}
  </section>
);

const DesignSystem: React.FC = () => {
  const t = useT();
  useLocale(); // re-render on language / numeral change
  const [tab, setTab] = React.useState('overview');
  const [modal, setModal] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  const columns: Column<SampleRow>[] = [
    { key: 'name', header: 'Student', accessor: 'name', primary: true },
    { key: 'klass', header: 'Class', accessor: 'klass' },
    { key: 'due', header: 'Due', accessor: 'due', align: 'right', render: (r) => formatCurrency(r.due), exportValue: (r) => r.due },
    { key: 'status', header: 'Status', accessor: 'status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  const heatDays = React.useMemo(() => {
    const out = [];
    const start = new Date('2026-08-01T00:00:00');
    for (let i = 0; i < 56; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const isFri = d.getDay() === 5;
      out.push({ date: iso, rate: isFri ? null : 62 + ((i * 37) % 38) });
    }
    return out;
  }, []);

  return (
    <div className="space-y-12 pb-16">
      <PageHeader
        title="Design system"
        description="PeopleNIT tokens and components. All data on this page is sample content for demonstration only."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Design system' }]}
        actions={<Badge variant="warning" dot>Sample content</Badge>}
      />

      <Section id="colors" title="Colour tokens" description="Contrast ratios are measured against white (WCAG AA requires 4.5:1 for body text).">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="glass-card overflow-hidden">
              <div className="h-16 flex items-end p-3 text-xs font-semibold" style={{ background: s.hex, color: s.text ?? '#1E1E1E' }}>
                {s.hex}
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{s.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.use}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Typography" description="Inter for English, Hind Siliguri for Bangla. Switch language in the top bar to preview.">
        <Card className="space-y-3">
          <p className="text-2xl font-semibold tracking-tight">Page title — {t('Students')}</p>
          <p className="text-lg font-semibold">Section heading — {t('Attendance')}</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">Body text. The quick brown fox jumps over the lazy dog. আমার সোনার বাংলা, আমি তোমায় ভালোবাসি।</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Caption / helper text</p>
          <DescriptionList
            columns={3}
            items={[
              { label: 'Currency (BDT)', value: formatCurrency(1234567.5) },
              { label: 'Number', value: formatNumber(98765) },
              { label: 'Date', value: formatDate('2026-09-26T10:30:00Z', true) },
            ]}
          />
        </Card>
      </Section>

      <Section id="buttons" title="Buttons">
        <Card className="flex flex-wrap items-center gap-3">
          <Button leftIcon={<Plus className="w-4 h-4" />}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />}>Delete</Button>
          <Button variant="danger-soft">Soft danger</Button>
          <Button variant="link">Link</Button>
          <Button isLoading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large CTA</Button>
          <Tooltip content="Edit">
            <Button variant="ghost" size="icon" aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
          </Tooltip>
        </Card>
      </Section>

      <Section id="badges" title="Badges & status">
        <Card className="flex flex-wrap gap-2">
          {['PAID', 'PARTIAL', 'UNPAID', 'OVERDUE', 'PRESENT', 'ABSENT', 'LATE', 'PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE'].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <Badge variant="primary" dot>Primary</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="info">Info</Badge>
        </Card>
      </Section>

      <Section id="forms" title="Form controls" description="Labels are programmatically linked; errors use aria-invalid and are announced.">
        <Card className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Full name" placeholder="e.g. Rahima Akter" required />
          <Input label="Mobile number" placeholder="01XXXXXXXXX" error="Enter a valid Bangladeshi mobile number" defaultValue="0171" />
          <Select label="Class" placeholder="Select class" options={[{ value: '1', label: 'Class 1' }, { value: '2', label: 'Class 2' }]} helperText="Classes come from Academics → Class" />
          <Input label="Admission date" type="date" />
          <Textarea label="Notes" containerClassName="md:col-span-2" rows={3} />
          <Checkbox label="Send SMS to guardian" description="Uses the institution's SMS balance" />
        </Card>
      </Section>

      <Section id="stats" title="Stat cards" description="Trend arrows only appear when the trend is computed from real data.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Total students" value={formatNumber(1248)} icon={<Users />} hint="Sample" />
          <StatCard label="Collected this month" value={formatCurrency(845000)} icon={<Wallet />} tone="success" trend={{ direction: 'up', label: '12%' }} hint="vs last month (sample)" />
          <StatCard label="Attendance today" value="91%" icon={<CalendarCheck />} tone="info" trend={{ direction: 'down', label: '3%' }} hint="vs 7-day avg (sample)" />
          <StatCard label="Absent streaks" value={formatNumber(7)} icon={<GraduationCap />} tone="warning" trend={{ direction: 'up', label: '2', upIsGood: false }} hint="sample" />
        </div>
        <SkeletonStatGrid />
      </Section>

      <Section id="table" title="Data table" description="Search, sort, column visibility, export, bulk actions. Resize below 768px to see the card layout.">
        <DataTable
          data={SAMPLE_ROWS}
          columns={columns}
          selectable
          exportFileName="sample-students"
          bulkActions={(rows, clear) => (
            <Button size="sm" variant="secondary" onClick={() => { toast.success(`${rows.length} rows (sample action)`); clear(); }}>
              Send reminder
            </Button>
          )}
          actions={[
            { label: 'View', icon: 'view', onClick: () => setDrawer(true) },
            { label: 'Delete', icon: 'delete', variant: 'danger', onClick: () => setConfirm(true) },
          ]}
          caption="Sample students"
        />
      </Section>

      <Section id="overlays" title="Overlays, tabs & menus">
        <Card className="space-y-5">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
            <Button variant="secondary" onClick={() => setDrawer(true)}>Open side drawer</Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>Confirm dialog</Button>
            <Button variant="secondary" onClick={() => toast.success('Saved successfully')}>Success toast</Button>
            <Button variant="secondary" onClick={() => toast.error('Could not save. Try again.')}>Error toast</Button>
            <Dropdown
              align="left"
              trigger={(p) => <Button {...p} variant="secondary" rightIcon={<Download className="w-4 h-4" />}>Menu</Button>}
              sections={[{ items: [{ id: 'a', label: 'Export CSV' }, { id: 'b', label: 'Export Excel' }, { id: 'c', label: 'Delete', danger: true }] }]}
            />
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            label="Student profile sections (sample)"
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'attendance', label: 'Attendance' },
              { id: 'fees', label: 'Fees', count: 2 },
              { id: 'documents', label: 'Documents' },
            ]}
          />
          <TabPanel id="overview" value={tab}>
            <div className="flex items-center gap-3"><Avatar name="Sample Student" /><SkeletonTextDemo /></div>
          </TabPanel>
          <TabPanel id="attendance" value={tab}>
            <AttendanceHeatmap days={heatDays} title="Sample attendance heatmap" />
          </TabPanel>
          <TabPanel id="fees" value={tab}><EmptyState compact title="No invoices" description="Sample empty state." /></TabPanel>
          <TabPanel id="documents" value={tab}><ErrorState compact message="Sample: the documents request failed." onRetry={() => toast('Retry (sample)')} /></TabPanel>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Press <Kbd>Ctrl</Kbd><Kbd>K</Kbd> anywhere to open the command palette, <Kbd>?</Kbd> for shortcuts.
          </div>
        </Card>
      </Section>

      <Section id="feedback" title="Feedback & states">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Alert tone="info" title="Info">Fee reminders go out at 9:00 AM.</Alert>
          <Alert tone="success" title="Saved">Attendance for Class 5 – A was submitted.</Alert>
          <Alert tone="warning" title="Partial payment">৳1,500 remains on this invoice.</Alert>
          <Alert tone="danger" title="Payment failed" action={<Button size="sm" variant="secondary">Retry</Button>}>The gateway declined the transaction.</Alert>
          <IncompleteNotice reason="Branch switching needs branch endpoints that the API does not provide yet." />
          <UpgradePrompt feature="Transport" onUpgrade={() => toast('Upgrade flow (sample)')} />
          <AiGeneratedNotice className="lg:col-span-2">
            <Textarea label="Report card remark" defaultValue="Rahim shows steady progress in Mathematics and participates actively in class. (sample)" helperText="Edit before publishing to guardians." />
          </AiGeneratedNotice>
        </div>
      </Section>

      <Section id="print" title="Printable document" description="Receipts, invoices, report cards, transcripts, payslips and certificates share this frame.">
        <PrintLayout title="Money Receipt" reference="Receipt No. SAMPLE-0001" footer={<SignatureLines labels={['Received by', 'Accountant']} />}>
          <DescriptionList
            items={[
              { label: 'Student', value: 'Sample Student' },
              { label: 'Class', value: 'Class 5 – A' },
              { label: 'Amount paid', value: formatCurrency(2500) },
              { label: 'Method', value: 'Cash' },
            ]}
          />
        </PrintLayout>
      </Section>

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title="Add fee category"
        description="Sample modal with header and sticky footer."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>{t('Cancel')}</Button>
            <Button onClick={() => { setModal(false); toast.success('Saved (sample)'); }}>{t('Save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Category name" required />
          <Input label="Default amount" type="number" helperText="In BDT" />
        </div>
      </Modal>

      <Drawer isOpen={drawer} onClose={() => setDrawer(false)} title="Sample Student" description="Quick view (sample)" footer={<Button onClick={() => setDrawer(false)}>{t('Close')}</Button>}>
        <DescriptionList columns={1} items={[{ label: 'Class', value: 'Class 5 – A' }, { label: 'Guardian', value: 'Sample Guardian' }, { label: 'Due', value: formatCurrency(1500) }]} />
      </Drawer>

      <ConfirmModal
        isOpen={confirm}
        title="Delete student?"
        message="This is a sample confirmation. Nothing will be deleted."
        confirmLabel="Delete"
        onConfirm={() => { setConfirm(false); toast.success('Nothing was deleted (sample)'); }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
};

const SkeletonTextDemo = () => (
  <div className="flex-1 space-y-2">
    <Skeleton className="h-4 w-40" />
    <Skeleton className="h-3 w-64 max-w-full" />
  </div>
);

export default DesignSystem;
