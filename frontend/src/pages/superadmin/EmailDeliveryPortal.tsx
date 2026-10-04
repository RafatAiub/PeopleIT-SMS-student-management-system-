import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, RefreshCw, Send, ShieldOff, Eye, Globe2 } from 'lucide-react';
import apiClient from '@/api/client';
import { PageHeader, Card, Badge, Button, Input, Table, TableHead, TableHeaderCell, TableRow, TableCell, Tabs, TabPanel, Skeleton } from '@/components/ui';

// =============================================================================
// Super Admin — Email Delivery console (Track A4).
//   Status   — transport mode, from address, daily budget
//   Log      — last EmailLog rows (masked addresses only)
//   Suppressions — bounce/spam/unsubscribe list, manual add/remove
//   Templates — preview gallery of every statically-defined template
//   DNS      — mail.eoncodigital.com authentication checklist (static guidance)
// =============================================================================

interface Status {
  mode: 'brevo-api' | 'smtp' | 'demo';
  fromAddress: string;
  fromName: string | null;
  replyTo: string | null;
  budget: { limit: number; reservedForP0: number; usedToday: number; remaining: number };
  suppressionCount: number;
}

interface EmailLogRow {
  id: string;
  template: string;
  priority: string;
  status: string;
  toMasked: string;
  subject: string;
  provider: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface SuppressionRow {
  id: string;
  email: string;
  scope: string;
  reason: string;
  source: string;
  note: string | null;
  createdAt: string;
}

const MODE_LABEL: Record<Status['mode'], string> = { 'brevo-api': 'Brevo API', smtp: 'SMTP relay', demo: 'Demo (not configured)' };
const MODE_VARIANT: Record<Status['mode'], 'success' | 'warning' | 'neutral'> = { 'brevo-api': 'success', smtp: 'success', demo: 'warning' };
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  SENT: 'success',
  QUEUED: 'neutral',
  DEFERRED: 'warning',
  SKIPPED: 'neutral',
  SUPPRESSED: 'warning',
  FAILED: 'danger',
};

const EmailDeliveryPortal: React.FC = () => {
  const [tab, setTab] = useState('status');
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressionRow[]>([]);
  const [templates, setTemplates] = useState<{ key: string; description: string }[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('');
  const [suppressEmail, setSuppressEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, sup, t] = await Promise.all([
        apiClient.get('/email/admin/status'),
        apiClient.get('/email/admin/logs?page=1&pageSize=50'),
        apiClient.get('/email/admin/suppressions?page=1&pageSize=50'),
        apiClient.get('/email/admin/templates'),
      ]);
      setStatus(s.data.data);
      setLogs(l.data.data);
      setSuppressions(sup.data.data);
      setTemplates(t.data.data);
    } catch (err) {
      console.error('Failed to load email admin data', err);
      toast.error('Failed to load email delivery data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sendTest = async () => {
    if (!testTo) return;
    try {
      const res = await apiClient.post('/email/admin/test-send', { to: testTo });
      toast.success(`Test email: ${res.data.data.status}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to send test email');
    }
  };

  const addSuppression = async () => {
    if (!suppressEmail) return;
    try {
      await apiClient.post('/email/admin/suppressions', { email: suppressEmail, scope: 'ALL', reason: 'MANUAL' });
      toast.success('Address suppressed');
      setSuppressEmail('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to suppress address');
    }
  };

  const removeSuppression = async (email: string) => {
    try {
      await apiClient.delete(`/email/admin/suppressions?email=${encodeURIComponent(email)}`);
      toast.success('Suppression removed');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to remove suppression');
    }
  };

  const loadPreview = async (key: string) => {
    try {
      const res = await apiClient.get(`/email/admin/templates/preview?key=${encodeURIComponent(key)}`);
      setPreview(res.data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to render preview');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Email delivery"
        description="Transport status, daily send budget, delivery log, suppression list and template previews."
        actions={
          <Button variant="secondary" onClick={load} isLoading={loading}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        }
      />

      <Tabs
        label="Email delivery sections"
        variant="pills"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'status', label: 'Status', icon: <Mail className="w-4 h-4" /> },
          { id: 'logs', label: 'Delivery log' },
          { id: 'suppressions', label: 'Suppressions', icon: <ShieldOff className="w-4 h-4" /> },
          { id: 'templates', label: 'Templates', icon: <Eye className="w-4 h-4" /> },
          { id: 'dns', label: 'DNS setup', icon: <Globe2 className="w-4 h-4" /> },
        ]}
      />

      <TabPanel id="status" value={tab}>
        {loading && !status ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="space-y-3">
              <h4 className="text-sm font-semibold">Transport</h4>
              {status && <Badge variant={MODE_VARIANT[status.mode]}>{MODE_LABEL[status.mode]}</Badge>}
              <div className="text-xs text-slate-500 space-y-1 pt-2">
                <div>From: {status?.fromAddress}</div>
                {status?.fromName && <div>Display name: {status.fromName}</div>}
                {status?.replyTo && <div>Reply-to: {status.replyTo}</div>}
              </div>
            </Card>
            <Card className="space-y-3">
              <h4 className="text-sm font-semibold">Daily budget (Brevo free plan)</h4>
              <div className="text-2xl font-bold font-mono">{status?.budget.usedToday} / {status?.budget.limit}</div>
              <div className="text-xs text-slate-500">Remaining: {status?.budget.remaining} · Reserved for security mail: {status?.budget.reservedForP0}</div>
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${status ? Math.min((status.budget.usedToday / status.budget.limit) * 100, 100) : 0}%` }} />
              </div>
            </Card>
            <Card className="space-y-3">
              <h4 className="text-sm font-semibold">Send a test email</h4>
              <Input placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Button onClick={sendTest} disabled={!testTo}><Send className="w-4 h-4" /> Send test</Button>
              <p className="text-[11px] text-slate-400">Suppression count: {status?.suppressionCount}</p>
            </Card>
          </div>
        )}
      </TabPanel>

      <TabPanel id="logs" value={tab}>
        <Card className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Template</TableHeaderCell>
              <TableHeaderCell>To</TableHeaderCell>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>Priority</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Provider</TableHeaderCell>
            </TableHead>
            <tbody>
              {logs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{new Date(row.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs font-mono">{row.template}</TableCell>
                  <TableCell className="text-xs font-mono">{row.toMasked}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate">{row.subject}</TableCell>
                  <TableCell className="text-xs">{row.priority}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{row.status}</Badge></TableCell>
                  <TableCell className="text-xs">{row.provider ?? '—'}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      </TabPanel>

      <TabPanel id="suppressions" value={tab}>
        <Card className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Suppress an address (ALL scope)" value={suppressEmail} onChange={(e) => setSuppressEmail(e.target.value)} />
            <Button onClick={addSuppression} disabled={!suppressEmail}>Suppress</Button>
          </div>
          <Table>
            <TableHead>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Scope</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
              <TableHeaderCell>Since</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableHead>
            <tbody>
              {suppressions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs font-mono">{row.email}</TableCell>
                  <TableCell><Badge variant={row.scope === 'ALL' ? 'danger' : 'warning'}>{row.scope}</Badge></TableCell>
                  <TableCell className="text-xs">{row.reason}</TableCell>
                  <TableCell className="text-xs">{row.source}</TableCell>
                  <TableCell className="text-xs">{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell><Button variant="ghost" onClick={() => removeSuppression(row.email)}>Remove</Button></TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      </TabPanel>

      <TabPanel id="templates" value={tab}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="space-y-2">
            <h4 className="text-sm font-semibold mb-2">Templates</h4>
            {templates.map((t) => (
              <button
                key={t.key}
                onClick={() => loadPreview(t.key)}
                className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <div className="text-sm font-medium">{t.key}</div>
                <div className="text-xs text-slate-500">{t.description}</div>
              </button>
            ))}
          </Card>
          <Card>
            {preview ? (
              <>
                <div className="text-xs text-slate-500 mb-2">Subject: {preview.subject}</div>
                <iframe title="Email preview" srcDoc={preview.html} className="w-full h-[600px] rounded-xl border border-slate-200 dark:border-white/5 bg-white" />
              </>
            ) : (
              <p className="text-sm text-slate-500">Select a template to preview.</p>
            )}
          </Card>
        </div>
      </TabPanel>

      <TabPanel id="dns" value={tab}>
        <Card className="space-y-4">
          <h4 className="text-sm font-semibold">Domain authentication checklist — mail.eoncodigital.com</h4>
          <p className="text-xs text-slate-500">Add these records in your DNS provider, then verify domain ownership in Brevo (Senders, Domains &amp; Dedicated IPs). This panel is static guidance — it does not check DNS automatically.</p>
          <ol className="list-decimal list-inside text-sm space-y-3">
            <li>
              <span className="font-medium">brevo-code TXT record</span> — copy the exact value shown in Brevo's domain-authentication screen and add it as a TXT record on <code>mail.eoncodigital.com</code>.
            </li>
            <li>
              <span className="font-medium">DKIM CNAME records</span> — add both <code>brevo1._domainkey.mail.eoncodigital.com</code> and <code>brevo2._domainkey.mail.eoncodigital.com</code>, each pointing to the CNAME target Brevo shows.
            </li>
            <li>
              <span className="font-medium">DMARC TXT record</span> — add <code>_dmarc.mail.eoncodigital.com</code> with value <code>v=DMARC1; p=none; rua=mailto:you@eoncodigital.com</code> to start monitoring without rejecting mail, then tighten to <code>quarantine</code>/<code>reject</code> once reports look clean.
            </li>
            <li>Wait for DNS propagation (can take up to 24-48h), then click "Verify" in Brevo.</li>
            <li>Set <code>BREVO_API_KEY</code> in production once the domain is verified — this system automatically switches from SMTP to the Brevo API when that variable is present.</li>
          </ol>
        </Card>
      </TabPanel>
    </div>
  );
};

export default EmailDeliveryPortal;
