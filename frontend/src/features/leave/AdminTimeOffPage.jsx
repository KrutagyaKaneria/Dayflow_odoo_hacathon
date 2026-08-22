import { useState } from 'react';
import { AdminLeaveListTab } from './AdminLeaveListTab';
import { AllocationTab } from './AllocationTab';
import './TimeOffPage.css';

// [UNCLEAR] The design draws the two balance banners on the ADMIN screen as well as the
// employee's, with no indication of whose balance they show — the admin's own? a selected
// employee's? a company default? Nothing in either source resolves this. This phase does NOT
// render balance banners on the Admin screen; the Allocation tab carries per-employee balance
// data instead, which is the only unambiguous reading.
// TODO(D-31): confirm what those banners are meant to display.
//
// [UNCLEAR / D-15] The design shows a "NEW" button on the ADMIN Time Off screen. Whether this
// means an Admin can file a leave request ON BEHALF OF an employee is not stated anywhere. This
// phase does NOT build that capability — POST /leaves is strictly self-scoped, and accepting an
// employee ID from an admin caller would widen the endpoint's contract on an assumption. The
// button is not rendered on the Admin screen.
// TODO(D-15): confirm whether admin-on-behalf-of leave filing is required.
export function AdminTimeOffPage() {
  const [tab, setTab] = useState('time-off');

  return (
    <div className="time-off-page">
      <div className="time-off-page__subtabs">
        <button type="button" className={tab === 'time-off' ? 'is-active' : ''} onClick={() => setTab('time-off')}>
          Time Off
        </button>
        <button type="button" className={tab === 'allocation' ? 'is-active' : ''} onClick={() => setTab('allocation')}>
          Allocation
        </button>
      </div>
      {tab === 'time-off' ? <AdminLeaveListTab /> : <AllocationTab />}
    </div>
  );
}
