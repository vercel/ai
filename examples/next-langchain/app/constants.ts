import {
  MessageCircle,
  Cpu,
  Wrench,
  Cloud,
  Shield,
  LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

export const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Basic Chat',
    description: 'Simple LangChain streaming',
    icon: MessageCircle,
  },
  {
    href: '/langgraph',
    label: 'LangGraph',
    description: 'StateGraph with streaming',
    icon: Cpu,
  },
  {
    href: '/createAgent',
    label: 'ReAct Agent',
    description: 'Reasoning + multiple tools',
    icon: Wrench,
    badge: 'Multimodal',
  },
  {
    href: '/hitl',
    label: 'Human-in-the-Loop',
    description: 'Tool approval workflow',
    icon: Shield,
    badge: 'HITL',
  },
  {
    href: '/langsmith',
    label: 'LangSmith Deploy',
    description: 'Browser transport',
    icon: Cloud,
    badge: 'Direct',
  },
];
