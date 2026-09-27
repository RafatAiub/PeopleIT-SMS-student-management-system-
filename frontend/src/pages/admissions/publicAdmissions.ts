import { useEffect, useState } from 'react';
import apiClient from '@/api/client';

// Shared helpers for the two PUBLIC admissions pages (no login). The school
// comes from ?school=<slug> when the link was shared by the school, else the
// visitor picks it from the public institution list.

export interface PublicInstitution {
  name: string;
  slug: string;
}

export function useSchoolFromQuery(): [string, (slug: string) => void] {
  const [slug, setSlug] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('school') || '';
  });
  return [slug, setSlug];
}

export function usePublicInstitutions() {
  const [institutions, setInstitutions] = useState<PublicInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/institution/public/list')
      .then((res) => active && setInstitutions(res.data.data || []))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { institutions, loading, error };
}

export function queryParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) || '';
}
