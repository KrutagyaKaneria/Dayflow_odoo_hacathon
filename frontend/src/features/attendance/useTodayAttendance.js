import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { fetchToday, checkIn as checkInRequest, checkOut as checkOutRequest } from './api';

// Drives both the check-in/out widget and the nav status dot (R-D08) from a single shared
// fetch — both live in TopNav and consume this hook's return value, so there's exactly one
// GET /attendance/today call per mount, not one per consumer.
export function useTodayAttendance() {
  const { accessToken } = useAuth();
  const [state, setState] = useState({ checkedIn: false, checkInAt: null, checkedOut: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    setLoading(true);
    return fetchToday(accessToken)
      .then((data) => {
        setState(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doCheckIn = useCallback(async () => {
    setError(null);
    try {
      await checkInRequest(accessToken);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken, refresh]);

  const doCheckOut = useCallback(async () => {
    setError(null);
    try {
      await checkOutRequest(accessToken);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken, refresh]);

  return { ...state, loading, error, checkIn: doCheckIn, checkOut: doCheckOut };
}
