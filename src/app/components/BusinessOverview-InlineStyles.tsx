import { ProjectBudgetChart } from './ProjectBudgetChart';

interface BusinessOverviewProps {
  isAdmin: boolean;
}

// The admin dashboard "home" view.
//
// The former company-financials "Business Overview" section — the Revenue (SO) / Expenses (PO) /
// Net Profit / Profit Margin KPI cards, the time-period selector + Export button, and the
// "Expenses vs Revenue Trend" chart — was removed at the owner's request. Only the per-project
// budget overview ("Project Budgets") remains, and it reflows to the top of the page.
//
// DISPLAY ONLY: the underlying data and endpoints are untouched. The overview metrics/chart
// endpoints (../api/overview → /api/overview*) still exist and can be re-surfaced anytime;
// ProjectBudgetChart continues to load its own data independently.
export function BusinessOverview(_props: BusinessOverviewProps) {
  return (
    <div style={{ padding: '24px', fontFamily: 'Poppins, sans-serif' }}>
      {/* Project Overview — per-project budget vs committed spend (approved/ordered purchase
          requests). Grey card so the white per-project cards inside it stand out. */}
      <div style={{
        background: '#ececec',
        border: '1px solid #d6d6d6',
        borderRadius: '16px',
        padding: '24px',
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#000000', marginBottom: '6px' }}>
          Project Budgets
        </h2>
        <p style={{ fontSize: '13px', color: '#5a5a5a', marginBottom: '24px' }}>
          Remaining budget vs spend for each project — spend counts approved &amp; ordered purchase requests linked to the project.
        </p>
        <ProjectBudgetChart />
      </div>
    </div>
  );
}
