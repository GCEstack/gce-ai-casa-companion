import type { ReactNode } from 'react';

interface SidebarPanelProps {
  title: string;
  titleColor?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function SidebarPanel({ title, titleColor = '#14b8a6', icon, children, className = '' }: SidebarPanelProps) {
  return (
    <div
      className={`rounded-[18px] p-5 ${className}`}
      style={{
        background: '#14141f',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        {icon && <span style={{ color: titleColor }}>{icon}</span>}
        <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: titleColor }}>
          {title}
        </h3>
      </div>

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
