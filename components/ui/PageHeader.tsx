/**
 * Club 19 Atelier - Page Header Component
 *
 * Standardized header for all staff pages
 * Cormorant Garamond headings, taupe accents
 */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-serif font-semibold text-club19-navy">{title}</h1>
          <div className="mt-1 border-b-2 border-club19-taupe w-full"></div>
          {subtitle && <p className="mt-2 text-sm font-sans text-club19-taupe">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
