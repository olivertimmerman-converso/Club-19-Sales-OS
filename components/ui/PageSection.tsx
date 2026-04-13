/**
 * Club 19 Atelier - Page Section Component
 *
 * Container for page content sections — white card on off-white page
 */

interface PageSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function PageSection({ title, children, className = "" }: PageSectionProps) {
  return (
    <div className={`bg-white rounded-xl border border-club19-warmgrey shadow-subtle ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-club19-warmgrey">
          <h2 className="text-lg font-serif font-semibold text-club19-navy">{title}</h2>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
