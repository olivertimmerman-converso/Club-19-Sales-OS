/**
 * Club 19 Atelier - Status Badge Component
 *
 * Muted pill badges for sale status display
 */

interface StatusBadgeProps {
  status: "draft" | "invoiced" | "paid" | "locked" | "commission_paid";
}

const statusConfig = {
  draft: {
    label: "Draft",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
  },
  invoiced: {
    label: "Invoiced",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
  },
  paid: {
    label: "Paid",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    borderColor: "border-green-200",
  },
  locked: {
    label: "Locked",
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
  },
  commission_paid: {
    label: "Commission Paid",
    bgColor: "bg-club19-cream",
    textColor: "text-club19-navy",
    borderColor: "border-club19-warmgrey",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-sans font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
    >
      {config.label}
    </span>
  );
}
