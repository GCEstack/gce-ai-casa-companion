import {
  Hand,
  BookOpen,
  Music,
  Globe,
  FlaskConical,
  Languages,
  Pencil,
  Code,
  Wind,
  Trophy,
  GraduationCap,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Hand,
  BookOpen,
  Music,
  Globe,
  FlaskConical,
  Languages,
  Pencil,
  Code,
  Wind,
  Trophy,
  GraduationCap,
  Sparkles,
};

export function ModeIcon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = iconMap[name] || Sparkles;
  return <Icon className={className} style={style} />;
}
