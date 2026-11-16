import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Code2,
  Compass,
  Cpu,
  FileSpreadsheet,
  HeartPulse,
  Home,
  Layers,
  Lightbulb,
  Search,
  ShieldCheck,
  Sun,
  Target,
  Wallet,
} from 'lucide-react';

interface AgentIconProps {
  iconName: string;
  className?: string;
}

export function AgentIcon({ iconName, className = 'w-4 h-4' }: AgentIconProps) {
  switch (iconName) {
    case 'Search':
      return <Search className={className} />;
    case 'BarChart3':
      return <BarChart3 className={className} />;
    case 'Code2':
      return <Code2 className={className} />;
    case 'ShieldCheck':
      return <ShieldCheck className={className} />;
    case 'Compass':
      return <Compass className={className} />;
    case 'CalendarCheck':
      return <CalendarCheck className={className} />;
    case 'Wallet':
      return <Wallet className={className} />;
    case 'Home':
      return <Home className={className} />;
    case 'BookOpen':
      return <BookOpen className={className} />;
    case 'Target':
      return <Target className={className} />;
    case 'FileSpreadsheet':
      return <FileSpreadsheet className={className} />;
    case 'HeartPulse':
      return <HeartPulse className={className} />;
    case 'AlertTriangle':
      return <AlertTriangle className={className} />;
    case 'Sun':
      return <Sun className={className} />;
    case 'Lightbulb':
      return <Lightbulb className={className} />;
    case 'Layers':
      return <Layers className={className} />;
    default:
      return <Cpu className={className} />;
  }
}
