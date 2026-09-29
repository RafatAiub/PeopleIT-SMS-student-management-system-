// Report card preview + download, shared by the staff Student Marksheet tab
// (MarksEntry) and the student/guardian self-service view (MyExamResults).
// Same GET /results/:studentId/report-card?examId=... blob endpoint either
// screen already called directly — this only adds an in-page PDF preview
// before downloading, it does not change what's requested or how.
import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Drawer, Button, Skeleton, ErrorState } from '../../../components/ui';

interface ReportCardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fileName: string;
  /** Fetches the report card PDF blob; called once each time the drawer opens. */
  fetchBlob: () => Promise<Blob>;
}

export const ReportCardDrawer: React.FC<ReportCardDrawerProps> = ({ isOpen, onClose, title, description, fileName, fetchBlob }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    fetchBlob()
      .then((blob) => {
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl]
  );

  const handleDownload = () => {
    if (!objectUrl) return;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.click();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      width="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="primary" onClick={handleDownload} disabled={!objectUrl || loading}>
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-[60vh] w-full" />
        </div>
      ) : error ? (
        <ErrorState message="Report card not available for this exam yet." onRetry={load} />
      ) : objectUrl ? (
        <iframe title={title} src={objectUrl} className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-white/10" />
      ) : null}
    </Drawer>
  );
};
