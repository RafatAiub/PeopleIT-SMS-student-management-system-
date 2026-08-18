import React, { useEffect, useState } from 'react';
import { CreditCard, Download, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { IdCardPreview, IdCardTemplate } from './IdCardPreview';

interface Guardian {
  relationship: string;
  guardian: { firstName: string; lastName: string; relationship: string };
}

interface MyCardDetail {
  id: string;
  cardNumber: string;
  verifyToken: string;
  issuedAt: string;
  expiresAt: string | null;
  status: 'ACTIVE' | 'REVOKED';
  userType: 'STUDENT' | 'STAFF';
  template: IdCardTemplate;
  student: {
    firstName: string;
    lastName: string;
    studentId: string;
    avatarUrl: string | null;
    class: { name: string } | null;
    section: { name: string } | null;
    dateOfBirth: string | null;
    bloodGroup: string | null;
    address: string | null;
    phone: string | null;
    guardians: Guardian[];
  } | null;
  staff: {
    employeeId: string | null;
    department: string | null;
    designation: string | null;
    user: { firstName: string; lastName: string; avatarUrl: string | null; phone: string | null };
  } | null;
}

export default function MyIdCard() {
  const [card, setCard] = useState<MyCardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notIssued, setNotIssued] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get('/id-cards/me')
      .then((res) => {
        if (cancelled) return;
        setCard(res.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setNotIssued(true);
        } else {
          toast.error(err.response?.data?.message || 'Failed to load your ID card');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await apiClient.get('/id-cards/me/pdf', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-id-card.pdf';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to download your ID card');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (notIssued || !card) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary-500" />
          My ID Card
        </h2>
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30">
          <EmptyState
            icon={<Inbox className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            title="No ID card has been issued to you yet"
            description="Once your institution's administrator generates an ID card for you, it will appear here."
          />
        </div>
      </div>
    );
  }

  const father = card.student?.guardians?.find((g) => g.relationship === 'FATHER')?.guardian;
  const mother = card.student?.guardians?.find((g) => g.relationship === 'MOTHER')?.guardian;

  const previewData = card.student
    ? {
        name: `${card.student.firstName} ${card.student.lastName}`,
        subtitle: `${card.student.class?.name ?? ''}${card.student.section?.name ? ' - ' + card.student.section.name : ''}`,
        classText: `${card.student.class?.name ?? ''}${card.student.section?.name ? ' - ' + card.student.section.name : ''}`,
        cardNumber: card.cardNumber,
        photoUrl: card.student.avatarUrl,
        admissionNo: card.student.studentId,
        fatherName: father ? `${father.firstName} ${father.lastName}` : null,
        motherName: mother ? `${mother.firstName} ${mother.lastName}` : null,
        address: card.student.address,
        dob: card.student.dateOfBirth ? new Date(card.student.dateOfBirth).toLocaleDateString() : null,
        bloodGroup: card.student.bloodGroup,
        phone: card.student.phone,
      }
    : {
        name: `${card.staff?.user.firstName ?? ''} ${card.staff?.user.lastName ?? ''}`,
        subtitle: `${card.staff?.designation ?? ''}${card.staff?.department ? ' · ' + card.staff.department : ''}`,
        cardNumber: card.cardNumber,
        photoUrl: card.staff?.user.avatarUrl,
        admissionNo: card.staff?.employeeId || undefined,
        designation: card.staff?.designation ?? null,
        department: card.staff?.department ?? null,
        phone: card.staff?.user.phone ?? null,
      };

  const isExpired = card.expiresAt ? new Date(card.expiresAt) < new Date() : false;
  const isValid = card.status === 'ACTIVE' && !isExpired;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary-500" />
          My ID Card
        </h2>
        <Button variant="gradient" onClick={handleDownload} disabled={downloading} isLoading={downloading}>
          <Download className="w-4 h-4" />
          Download PDF
        </Button>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/30 p-8 flex flex-col items-center gap-5">
        <IdCardPreview template={card.template} data={previewData} />
        <div
          className={`px-4 py-1.5 rounded-full text-xs font-bold ${
            isValid
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20'
          }`}
        >
          {isValid ? 'Valid ID Card' : card.status === 'REVOKED' ? 'Revoked' : 'Expired'}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Card Number: <span className="font-mono">{card.cardNumber}</span> · Issued {new Date(card.issuedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
