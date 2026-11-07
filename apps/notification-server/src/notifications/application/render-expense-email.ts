import type { ExpenseEmailSummary } from '../domain/expense-notification.js';

const colors = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#db2777'];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderExpenseEmail(summary?: ExpenseEmailSummary): {
  subject: string;
  text: string;
  html?: string;
} {
  // Keep legacy event requests identical when they are replayed.
  if (!summary) {
    return {
      subject: 'Expense Created',
      text: 'A new expense was added to your expense tracker.',
    };
  }

  const month = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${summary.month}-01T00:00:00Z`));
  const added = `${summary.expense_currency} ${summary.expense_amount}`;
  const money = (amount: string) => `${summary.currency} ${amount}`;
  const balance =
    summary.over_budget === '0.00'
      ? `${money(summary.remaining)} left`
      : `${money(summary.over_budget)} over budget`;
  const details = [summary.expense_category, summary.expense_description]
    .map((value) => value?.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const subject = [
    `${added} expense added`,
    ...details,
    `${balance} for ${month}`,
  ].join(' · ');
  const text = [
    `Expense added: ${added}`,
    `${month}: ${balance}.`,
    `Spent: ${money(summary.spent)} of ${money(summary.budget)}.`,
    '',
    'Category overview (EUR)',
    ...summary.categories.map(
      (item) => `${item.category}: ${money(item.amount)} (${item.percentage}%)`,
    ),
    '',
    'Snapshot taken when this expense was saved.',
  ].join('\n');

  const rows = summary.categories
    .map((item, index) => {
      const color = colors[index % colors.length];
      return `<tr>
      <td style="padding:14px 0;border-bottom:1px solid #e2e8f0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#334155;font-size:14px">
              <span style="color:${color}">&#9679;</span> ${escapeHtml(item.category)}
            </td>
            <td align="right" style="color:#0f172a;font-size:14px;font-weight:600">
              ${escapeHtml(money(item.amount))}
              <span style="color:#64748b;font-size:12px"> · ${item.percentage}%</span>
            </td>
          </tr>
          <tr><td colspan="2" style="padding-top:8px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0">
              <tr><td width="${item.percentage}%" height="6" style="background:${color};font-size:1px;line-height:6px">&#8203;</td>
              <td style="font-size:1px;line-height:6px">&#8203;</td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:28px">
  <p style="margin:0 0 12px;color:#64748b;font-size:12px;letter-spacing:1px">EXPENSE TRACKER</p>
  <h1 style="margin:0 0 8px;font-size:24px">Expense added</h1>
  <p style="margin:0 0 24px;font-size:28px;font-weight:700">${escapeHtml(added)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px">
    <tr><td style="padding:20px">
      <p style="margin:0 0 8px;color:#475569;font-size:14px">${escapeHtml(month)} budget</p>
      <p style="margin:0 0 8px;font-size:22px;font-weight:700">${escapeHtml(balance)}</p>
      <p style="margin:0;color:#475569;font-size:14px">${escapeHtml(money(summary.spent))} spent of ${escapeHtml(money(summary.budget))}</p>
    </td></tr>
  </table>
  <h2 style="margin:28px 0 4px;font-size:18px">Category overview</h2>
  <p style="margin:0 0 8px;color:#64748b;font-size:13px">${escapeHtml(month)} · EUR expenses</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${rows || '<tr><td style="padding:16px 0;color:#64748b">No EUR expenses this month.</td></tr>'}
  </table>
  <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:18px">Snapshot taken when this expense was saved. The overview uses expense dates and your monthly EUR target.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
