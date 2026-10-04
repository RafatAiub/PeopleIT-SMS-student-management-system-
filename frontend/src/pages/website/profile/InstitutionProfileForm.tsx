import React from 'react';
import { AlertCircle, BadgeCheck, Contact, Save, ShieldAlert, UserSquare2 } from 'lucide-react';
import { Card, CardHeader, Button, Input, Textarea, Skeleton, ErrorState } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useProfile, useUpdateProfile, apiError } from '../sites.queries';
import { MediaField } from '../media/MediaPicker';
import type { SiteOfficer, UpdateProfilePayload } from '../sites.types';
import { StaffPickerField, type StaffPickResult } from './StaffPickerField';

type HeadMode = 'none' | 'staff' | 'custom';

interface OfficerForm {
  name: string;
  designation: string;
  phone: string;
  email: string;
}

const emptyOfficer: OfficerForm = { name: '', designation: '', phone: '', email: '' };

function officerToForm(o: SiteOfficer | null): OfficerForm {
  return { name: o?.name ?? '', designation: o?.designation ?? '', phone: o?.phone ?? '', email: o?.email ?? '' };
}

const OfficerFields: React.FC<{
  idPrefix: string;
  value: OfficerForm;
  onChange: (v: OfficerForm) => void;
  errors: Record<string, string>;
}> = ({ idPrefix, value, onChange, errors }) => {
  const t = useT();
  const set = <K extends keyof OfficerForm>(k: K, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input id={`${idPrefix}-name`} label={t('Name')} value={value.name} onChange={(e) => set('name', e.target.value)} />
      <Input id={`${idPrefix}-designation`} label={t('Designation')} value={value.designation} onChange={(e) => set('designation', e.target.value)} />
      <Input id={`${idPrefix}-phone`} label={t('Phone')} value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      <Input id={`${idPrefix}-email`} label={t('Email')} type="email" value={value.email} error={errors[`${idPrefix}-email`]} onChange={(e) => set('email', e.target.value)} />
    </div>
  );
};

/**
 * Website > Profile — Bangla name, EIIN, established year, MPO and
 * recognition info, head of institution, information officer, complaints
 * officer. `GET/PUT /sites/profile` (WEBSITE_V3_PLAN.md §7.2).
 */
export const InstitutionProfileForm: React.FC = () => {
  const t = useT();
  const q = useProfile();
  const save = useUpdateProfile();

  const [nameBn, setNameBn] = React.useState('');
  const [eiin, setEiin] = React.useState('');
  const [establishedYear, setEstablishedYear] = React.useState('');
  const [mpoInfo, setMpoInfo] = React.useState('');
  const [recognitionInfo, setRecognitionInfo] = React.useState('');

  const [headMode, setHeadMode] = React.useState<HeadMode>('none');
  const [headUserId, setHeadUserId] = React.useState<string | null>(null);
  const [headName, setHeadName] = React.useState('');
  const [headPhoto, setHeadPhoto] = React.useState('');
  const [headDesignation, setHeadDesignation] = React.useState('');

  const [infoOfficer, setInfoOfficer] = React.useState<OfficerForm>(emptyOfficer);
  const [complaintsOfficer, setComplaintsOfficer] = React.useState<OfficerForm>(emptyOfficer);

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (!q.data || loaded.current) return;
    loaded.current = true;
    const p = q.data;
    setNameBn(p.nameBn ?? '');
    setEiin(p.eiin ?? '');
    setEstablishedYear(p.establishedYear != null ? String(p.establishedYear) : '');
    setMpoInfo(p.mpoInfo ?? '');
    setRecognitionInfo(p.recognitionInfo ?? '');
    const head = p.headOfInstitution;
    if (head?.userId) {
      setHeadMode('staff');
      setHeadUserId(head.userId);
      setHeadName(head.name ?? '');
      setHeadPhoto(head.photoUrl ?? '');
      setHeadDesignation(head.designation ?? '');
    } else if (head?.name) {
      setHeadMode('custom');
      setHeadName(head.name ?? '');
      setHeadPhoto(head.photoUrl ?? '');
      setHeadDesignation(head.designation ?? '');
    } else {
      setHeadMode('none');
    }
    setInfoOfficer(officerToForm(p.informationOfficer));
    setComplaintsOfficer(officerToForm(p.complaintsOfficer));
  }, [q.data]);

  const onPickStaff = (m: StaffPickResult) => {
    setHeadUserId(m.id);
    setHeadName(m.name);
    setHeadPhoto(m.photoUrl ?? '');
    setHeadDesignation(m.designation ?? '');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (establishedYear && (Number.isNaN(Number(establishedYear)) || Number(establishedYear) < 1800 || Number(establishedYear) > new Date().getFullYear() + 1)) {
      errs.establishedYear = t('Enter a valid year.');
    }
    if (headMode === 'staff' && !headUserId) errs.head = t('Search and choose a staff member, or switch to “Type a name”.');
    if (headMode === 'custom' && !headName.trim()) errs.head = t('Enter the head of institution’s name.');
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (infoOfficer.email && !emailRe.test(infoOfficer.email)) errs['info-officer-email'] = t('Enter a valid email address.');
    if (complaintsOfficer.email && !emailRe.test(complaintsOfficer.email)) errs['complaints-officer-email'] = t('Enter a valid email address.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload: UpdateProfilePayload = {
      nameBn: nameBn.trim() || null,
      eiin: eiin.trim() || null,
      establishedYear: establishedYear ? Number(establishedYear) : null,
      mpoInfo: mpoInfo.trim() || null,
      recognitionInfo: recognitionInfo.trim() || null,
      headOfInstitution:
        headMode === 'none'
          ? null
          : headMode === 'staff'
            ? { userId: headUserId ?? undefined, designation: headDesignation.trim() || undefined }
            : { name: headName.trim(), photoUrl: headPhoto.trim() || undefined, designation: headDesignation.trim() || undefined },
      informationOfficer: {
        name: infoOfficer.name.trim() || undefined,
        designation: infoOfficer.designation.trim() || undefined,
        phone: infoOfficer.phone.trim() || undefined,
        email: infoOfficer.email.trim() || undefined,
      },
      complaintsOfficer: {
        name: complaintsOfficer.name.trim() || undefined,
        designation: complaintsOfficer.designation.trim() || undefined,
        phone: complaintsOfficer.phone.trim() || undefined,
        email: complaintsOfficer.email.trim() || undefined,
      },
    };
    save.mutate(payload);
  };

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <ErrorState message={apiError(q.error, t('Could not load the institution profile.'))} onRetry={() => q.refetch()} />;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card>
        <CardHeader
          icon={<BadgeCheck className="w-4 h-4" />}
          title={t('Institution introduction')}
          description={t('Bangla name, EIIN, year established, MPO and recognition — required by the DSHE website order.')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="profile-nameBn" label={t('Institution name (Bangla)')} lang="bn" value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
          <Input id="profile-eiin" label={t('EIIN')} value={eiin} onChange={(e) => setEiin(e.target.value)} helperText={t('Educational Institution Identification Number.')} />
          <Input
            id="profile-established"
            label={t('Established year')}
            inputMode="numeric"
            value={establishedYear}
            error={errors.establishedYear}
            onChange={(e) => setEstablishedYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <Textarea
            id="profile-mpo"
            label={t('MPO / nationalisation info')}
            rows={3}
            value={mpoInfo}
            onChange={(e) => setMpoInfo(e.target.value)}
            helperText={t('MPO code, date, or nationalisation order — whichever applies.')}
          />
          <Textarea
            id="profile-recognition"
            label={t('Teaching permission and recognition')}
            rows={3}
            value={recognitionInfo}
            onChange={(e) => setRecognitionInfo(e.target.value)}
            helperText={t('Recognition/registration authority, number and date.')}
          />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<UserSquare2 className="w-4 h-4" />} title={t('Head of institution')} description={t('Shown on the website’s about page and staff directory.')} />
        <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label={t('Head of institution')}>
          {([
            ['none', t('Not set')],
            ['staff', t('Pick a staff member')],
            ['custom', t('Type a name')],
          ] as [HeadMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={headMode === mode}
              onClick={() => setHeadMode(mode)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                headMode === mode
                  ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-500/10 dark:text-primary-200'
                  : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {headMode === 'staff' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <StaffPickerField
              id="profile-head-staff"
              label={t('Staff member')}
              placeholder={t('Search staff by name')}
              selectedName={headName}
              onPick={onPickStaff}
            />
            <Input
              id="profile-head-designation-staff"
              label={t('Designation (override)')}
              value={headDesignation}
              onChange={(e) => setHeadDesignation(e.target.value)}
              helperText={t('Leave blank to use their staff designation.')}
            />
          </div>
        )}
        {headMode === 'custom' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="profile-head-name" label={t('Name')} value={headName} onChange={(e) => setHeadName(e.target.value)} />
            <Input id="profile-head-designation" label={t('Designation')} value={headDesignation} onChange={(e) => setHeadDesignation(e.target.value)} />
            <MediaField id="profile-head-photo" label={t('Photo')} value={headPhoto} onChange={setHeadPhoto} />
          </div>
        )}
        {errors.head && (
          <p className="field-error mt-2" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {errors.head}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Contact className="w-4 h-4" />} title={t('Information service officer')} description={t('তথ্যসেবা কেন্দ্র — DSHE item 8. Shown publicly.')} />
          <OfficerFields idPrefix="info-officer" value={infoOfficer} onChange={setInfoOfficer} errors={errors} />
        </Card>
        <Card>
          <CardHeader icon={<ShieldAlert className="w-4 h-4" />} title={t('Complaints officer')} description={t('অভিযোগ নিষ্পত্তি কর্মকর্তা — DSHE item 9. Shown publicly.')} />
          <OfficerFields idPrefix="complaints-officer" value={complaintsOfficer} onChange={setComplaintsOfficer} errors={errors} />
        </Card>
      </div>

      <div className="flex justify-end">
        <Button type="submit" isLoading={save.isPending} leftIcon={<Save className="w-4 h-4" />}>{t('Save profile')}</Button>
      </div>
    </form>
  );
};
