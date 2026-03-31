'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, DEFAULT_USER_PROFILE } from '@/types/personalization';
import { getProfile, updateProfile } from '@/lib/api';

export function usePersonalization() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getProfile()
      .then(data => setProfile(data))
      .catch(err => console.error('Failed to load profile', err))
      .finally(() => setIsLoading(false));
  }, []);

  const updateField = useCallback(<K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => {
    setProfile(prev => {
      const next = { ...prev, [key]: value };
      // debounced save
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setIsSaving(true);
        updateProfile(next)
          .finally(() => setIsSaving(false));
      }, 800);
      return next;
    });
  }, []);

  return { profile, isLoading, isSaving, updateField };
}
